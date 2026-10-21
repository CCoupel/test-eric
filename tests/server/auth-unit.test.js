import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/server/app.js';
import { runUserCreate } from '../../src/server/cli/user-create.js';
import { loadConfig } from '../../src/server/config.js';
import { allowedOrigins, checkOrigin, parseCookies } from '../../src/server/middleware/session.js';
import { authenticate, seedAdmin, signSession, verifySession } from '../../src/server/services/auth.js';

const url = process.env.DATABASE_URL;
const config = loadConfig({ DATABASE_URL: 'postgres://x@localhost/x', NODE_ENV: 'test' });

describe('parseCookies', () => {
  it('lit les paires, ignore les cookies mal formés ou mal encodés', () => {
    expect(parseCookies('a=1; sid=abc%20def; =x; bad=%E0%A4%A')).toEqual({ a: '1', sid: 'abc def' });
    expect(parseCookies(undefined)).toEqual({});
  });
});

describe('JWT de session', () => {
  const user = { id: '11111111-1111-1111-1111-111111111111', role: 'manager' };
  it('aller-retour valide, rejette signature, algorithme et expiration invalides', () => {
    const token = signSession(user, config);
    expect(verifySession(token, config)).toMatchObject({ sub: user.id, role: 'manager', tv: 0 });
    expect(verifySession(token, { sessionSecret: 'x'.repeat(40) })).toBeNull();
    expect(verifySession('pas.un.jwt', config)).toBeNull();
    const none = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(`{"sub":"${user.id}"}`).toString('base64url')}.`;
    expect(verifySession(none, config)).toBeNull();
  });
});

describe('checkOrigin', () => {
  const run = (method, headers = {}) => {
    let err;
    checkOrigin(config)({ method, headers }, null, (e) => { err = e; });
    return err;
  };
  const base = 'http://localhost:3000';
  it('laisse passer les méthodes sûres, l’Origin exacte, et une mutation sans Origin ni cookie de session', () => {
    expect(run('GET', { origin: 'https://evil.example', cookie: 'sid=x' })).toBeUndefined();
    expect(run('POST', { origin: base })).toBeUndefined();
    expect(run('POST', {})).toBeUndefined();
  });
  it('refuse en 403 : Origin étrangère/illisible, Host ≠ APP_BASE_URL, absence d’Origin avec cookie sid, Sec-Fetch-Site cross-site', () => {
    expect(() => run('POST', { origin: 'https://evil.example' })).toThrow(/Origine refusée/);
    expect(() => run('DELETE', { origin: 'pas-une-url' })).toThrow(/Origine refusée/);
    expect(() => run('POST', { origin: 'http://localhost:5173', host: 'localhost:5173' })).toThrow(/Origine refusée/);
    expect(() => run('PATCH', { cookie: 'a=1; sid=abc' })).toThrow(/Origine refusée/);
    expect(() => run('POST', { origin: base, 'sec-fetch-site': 'cross-site' })).toThrow(/Origine refusée/);
    expect(run('POST', { origin: base, 'sec-fetch-site': 'same-origin' })).toBeUndefined();
  });
});

describe('erreur interne', () => {
  it('500 internal_error quand la base échoue pendant la vérification de session, sans fuite', async () => {
    const pool = { query: async () => { throw new Error('secret postgres://u:pw@db'); } };
    const app = createApp({ config, pool });
    const res = await request(app).get('/api/auth/me').set('Cookie', `sid=${signSession({ id: 'u', role: 'manager' }, config)}`);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'internal_error', message: 'Erreur interne' });
  });
});

describe.skipIf(!url)('seed admin et user:create (PostgreSQL)', () => {
  let pool;
  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url, max: 2 });
    await pool.query('TRUNCATE users CASCADE');
  });
  afterAll(async () => {
    await pool.query('TRUNCATE users CASCADE');
    await pool.end();
  });

  it('seedAdmin : crée le compte une fois (e-mail normalisé), idempotent, sans ADMIN_* ne fait rien', async () => {
    const log = { log: () => {} };
    const cfg = loadConfig({ DATABASE_URL: url, NODE_ENV: 'test', ADMIN_EMAIL: 'Admin@Club.FR', ADMIN_PASSWORD: 'Zx9-sel-unique-12+', ADMIN_NAME: 'Chef' });
    expect(await seedAdmin(pool, cfg, log)).toBe(true);
    expect(await seedAdmin(pool, cfg, log)).toBe(false);
    expect(await seedAdmin(pool, config, log)).toBe(false);
    const { rows } = await pool.query('SELECT email, role, password_hash FROM users');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ email: 'admin@club.fr', role: 'admin' });
    expect(rows[0].password_hash).not.toContain('mot-de-passe');
    expect((await authenticate(pool, 'ADMIN@club.fr', 'Zx9-sel-unique-12+')).name).toBe('Chef');
    expect(await authenticate(pool, 'admin@club.fr', 'faux')).toBeNull();
    expect(await authenticate(pool, 'inconnu@club.fr', 'x')).toBeNull();
  });

  it('runUserCreate : mot de passe généré utilisable, doublon et usage refusés', async () => {
    const { user, password } = await runUserCreate(pool, ['marie@club.fr', 'Marie', 'Dupont']);
    expect(user).toMatchObject({ email: 'marie@club.fr', name: 'Marie Dupont', role: 'manager' });
    expect(password.length).toBeGreaterThanOrEqual(16);
    expect(await authenticate(pool, 'marie@club.fr', password)).not.toBeNull();
    await expect(runUserCreate(pool, ['marie@club.fr', 'Autre'])).rejects.toThrow(/existe déjà/);
    await expect(runUserCreate(pool, ['pasunemail', 'X'])).rejects.toThrow(/Usage/);
    await expect(runUserCreate(pool, ['x@y.fr'])).rejects.toThrow(/Usage/);
  });
});

describe('trust proxy et rate-limit par IP (pool simulé)', () => {
  const pool = { query: async () => ({ rows: [] }) };
  const post = (app, ip) =>
    request(app).post('/api/auth/login').set('X-Forwarded-For', ip).send({ email: `u${ip}@club.fr`, password: 'x' });

  it('sans TRUST_PROXY : X-Forwarded-For ignoré, tous les clients partagent la même IP (429 dès la limite)', async () => {
    const app = createApp({ config, pool, loginLimit: 2 });
    expect((await post(app, '1.1.1.1')).status).toBe(401);
    expect((await post(app, '2.2.2.2')).status).toBe(401);
    expect((await post(app, '3.3.3.3')).status).toBe(429);
  });
  it('avec TRUST_PROXY=1 : une IP distincte par X-Forwarded-For', async () => {
    const cfg = loadConfig({ DATABASE_URL: 'postgres://x@localhost/x', NODE_ENV: 'test', TRUST_PROXY: '1' });
    const app = createApp({ config: cfg, pool, loginLimit: 2 });
    for (const ip of ['1.1.1.1', '2.2.2.2', '3.3.3.3', '1.1.1.1']) expect((await post(app, ip)).status).toBe(401);
    expect((await post(app, '1.1.1.1')).status).toBe(429);
  });
});

describe('en-têtes /api', () => {
  it('Cache-Control: no-store sur les réponses /api', async () => {
    const res = await request(createApp({ config, pool: { query: async () => ({}) } })).get('/api/inconnu');
    expect(res.headers['cache-control']).toBe('no-store');
  });
});

describe('RATE_LIMIT_LOGIN_PER_IP_MIN', () => {
  const pool = { query: async () => ({ rows: [] }) };
  const attempt = (app, i) => request(app).post('/api/auth/login').send({ email: `u${i}@club.fr`, password: 'x' });

  it('défaut 10 ; valeur invalide refusée au démarrage', () => {
    expect(config.authLimits.loginPerIpPerMin).toBe(10);
    for (const bad of ['0', 'abc', '-3', '1.5']) {
      expect(() => loadConfig({ DATABASE_URL: 'postgres://x@localhost/x', NODE_ENV: 'test', RATE_LIMIT_LOGIN_PER_IP_MIN: bad })).toThrow(/RATE_LIMIT_LOGIN_PER_IP_MIN/);
    }
  });
  it('surcharge par l’environnement : 2 essais passent, le 3e est en 429', async () => {
    const cfg = loadConfig({ DATABASE_URL: 'postgres://x@localhost/x', NODE_ENV: 'test', RATE_LIMIT_LOGIN_PER_IP_MIN: '2' });
    const app = createApp({ config: cfg, pool });
    expect((await attempt(app, 1)).status).toBe(401);
    expect((await attempt(app, 2)).status).toBe(401);
    expect((await attempt(app, 3)).status).toBe(429);
  });
  it('sans surcharge : 10 essais passent, le 11e est en 429', async () => {
    const app = createApp({ config, pool });
    for (let i = 1; i <= 10; i++) expect((await attempt(app, i)).status).toBe(401);
    expect((await attempt(app, 11)).status).toBe(429);
  });
});

describe('allowedOrigins — alias loopback', () => {
  const origins = (url) => [...allowedOrigins(url)].sort();
  const check = (baseUrl, origin) => {
    let err;
    checkOrigin({ baseUrl })({ method: 'POST', headers: { origin, 'sec-fetch-site': 'same-origin' } }, null, (e) => { err = e; });
    return err;
  };

  it('APP_BASE_URL en localhost : 127.0.0.1 et [::1] de même protocole et port acceptés (cas QUALIF 127.0.0.1:8080)', () => {
    expect(origins('http://localhost:8080')).toEqual(['http://127.0.0.1:8080', 'http://[::1]:8080', 'http://localhost:8080']);
    expect(check('http://localhost:8080', 'http://127.0.0.1:8080')).toBeUndefined();
    expect(check('http://127.0.0.1:8080', 'http://localhost:8080')).toBeUndefined();
  });
  it('refus : autre port, autre protocole, autre hôte, sous-domaine piège', () => {
    for (const o of ['http://127.0.0.1:9999', 'https://127.0.0.1:8080', 'http://localhost', 'http://evil.example:8080', 'http://localhost.evil.example:8080', 'http://127.0.0.1.evil.example:8080']) {
      expect(() => check('http://localhost:8080', o), o).toThrow(/Origine refusée/);
    }
  });
  it('APP_BASE_URL publique : aucun alias loopback toléré', () => {
    expect(origins('https://club.example')).toEqual(['https://club.example']);
    expect(() => check('https://club.example', 'http://127.0.0.1:443')).toThrow(/Origine refusée/);
    expect(() => check('https://club.example', 'https://127.0.0.1')).toThrow(/Origine refusée/);
  });
});

describe('checkOrigin — Host non fiable, message explicite', () => {
  const run = (headers) => {
    let err;
    checkOrigin({ baseUrl: 'http://localhost:8080' })({ method: 'POST', headers }, null, (e) => { err = e; });
    return err;
  };
  it('Host forgé (avec ou sans Sec-Fetch-Site same-origin) ne rend pas une Origin tierce acceptable', () => {
    expect(() => run({ origin: 'http://evil.example', host: 'evil.example', 'sec-fetch-site': 'same-origin' })).toThrow(/Origine refusée/);
    expect(() => run({ origin: 'http://evil.example', host: 'localhost:8080' })).toThrow(/Origine refusée/);
  });
  it('le message indique l’adresse attendue (et l’origine reçue, tronquée)', () => {
    try {
      run({ origin: 'http://192.168.1.10:8080' });
      expect.unreachable();
    } catch (e) {
      expect(e.status).toBe(403);
      expect(e.message).toContain('http://localhost:8080');
      expect(e.message).toContain('http://192.168.1.10:8080');
    }
  });
});

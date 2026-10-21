import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/server/app.js';
import { runUserCreate } from '../../src/server/cli/user-create.js';
import { loadConfig } from '../../src/server/config.js';
import { checkOrigin, parseCookies } from '../../src/server/middleware/session.js';
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
    expect(verifySession(token, config)).toMatchObject({ sub: user.id, role: 'manager' });
    expect(verifySession(token, { sessionSecret: 'x'.repeat(40) })).toBeNull();
    expect(verifySession('pas.un.jwt', config)).toBeNull();
    const none = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(`{"sub":"${user.id}"}`).toString('base64url')}.`;
    expect(verifySession(none, config)).toBeNull();
  });
});

describe('checkOrigin', () => {
  const run = (method, origin, host = 'localhost:3000') => {
    let err;
    checkOrigin(config)({ method, headers: { origin, host } }, null, (e) => { err = e; });
    return err;
  };
  it('laisse passer GET, absence d’Origin, Origin de l’application ou du Host (proxy de dev)', () => {
    expect(run('GET', 'https://evil.example')).toBeUndefined();
    expect(run('POST', undefined)).toBeUndefined();
    expect(run('POST', 'http://localhost:3000')).toBeUndefined();
    expect(run('POST', 'http://localhost:5173', 'localhost:5173')).toBeUndefined();
  });
  it('refuse en 403 une Origin étrangère ou illisible sur une méthode non sûre', () => {
    expect(() => run('POST', 'https://evil.example')).toThrow(/Origine refusée/);
    expect(() => run('DELETE', 'pas-une-url')).toThrow(/Origine refusée/);
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
    const cfg = loadConfig({ DATABASE_URL: url, NODE_ENV: 'test', ADMIN_EMAIL: 'Admin@Club.FR', ADMIN_PASSWORD: 'mot-de-passe-12+', ADMIN_NAME: 'Chef' });
    expect(await seedAdmin(pool, cfg, log)).toBe(true);
    expect(await seedAdmin(pool, cfg, log)).toBe(false);
    expect(await seedAdmin(pool, config, log)).toBe(false);
    const { rows } = await pool.query('SELECT email, role, password_hash FROM users');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ email: 'admin@club.fr', role: 'admin' });
    expect(rows[0].password_hash).not.toContain('mot-de-passe');
    expect((await authenticate(pool, 'ADMIN@club.fr', 'mot-de-passe-12+')).name).toBe('Chef');
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

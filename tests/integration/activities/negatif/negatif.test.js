// Integration : tests negatifs de securite sur /api/auth/login et /api/activities (injection, champs inconnus, taille, rejeu).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { hasDb, makeApp, closeApp, resetData, createUser, login, expectError, validActivity, BASE_URL } from '../../_support/harness.js';

describe.skipIf(!hasDb)('Securite - cas negatifs', () => {
  let ctx;
  let cookie;
  const api = (method, url) => request(ctx.app)[method](url).set('Cookie', cookie).set('Origin', BASE_URL);
  beforeAll(async () => {
    ctx = await makeApp();
    await resetData(ctx.pool);
    await createUser(ctx.pool, { email: 'marie@club.fr', password: 'motdepasse-solide-1' });
    cookie = await login(ctx.app, 'marie@club.fr', 'motdepasse-solide-1');
  });
  afterAll(() => closeApp(ctx));

  it('chaines d’injection SQL : stockees telles quelles, tables intactes', async () => {
    const evil = "'); DROP TABLE activities; --";
    const res = await api('post', '/api/activities').send(validActivity({ title: evil, location: evil }));
    expect(res.status).toBe(201);
    expect(res.body.activity.title).toBe(evil);
    expect((await api('get', '/api/activities')).body.activities.length).toBeGreaterThan(0);
  });

  it('id et filtre malveillants : 404 / 400 sans erreur SQL exposee', async () => {
    expectError(await api('get', "/api/activities/1'%20OR%20'1'='1"), 404, 'not_found');
    expectError(await api('get', "/api/activities?status=open'%20OR%201=1"), 400, 'validation_error');
  });

  it('login : injection dans l’e-mail -> 401, mot de passe > 72 octets -> 400, champ inconnu -> 400', async () => {
    const login_ = (body) => request(ctx.app).post('/api/auth/login').send(body);
    expectError(await login_({ email: "' OR 1=1 --", password: 'x' }), 401, 'invalid_credentials');
    expectError(await login_({ email: 'marie@club.fr', password: 'a'.repeat(73) }), 400, 'validation_error');
    expectError(await login_({ email: 'marie@club.fr', password: 'x', role: 'admin' }), 400, 'validation_error');
  });

  it('champs non declares (creation et modification) -> 400 validation_error', async () => {
    expectError(await api('post', '/api/activities').send(validActivity({ owner_id: '00000000-0000-4000-8000-000000000000' })), 400, 'validation_error');
    const a = (await api('post', '/api/activities').send(validActivity())).body.activity;
    expectError(await api('patch', `/api/activities/${a.id}`).send({ status: 'open' }), 400, 'validation_error');
  });

  it('corps JSON trop grand -> 413, corps malformé -> 400, sans fuite interne', async () => {
    const big = await api('post', '/api/activities').send({ title: 'x'.repeat(200_000) });
    expect(big.status).toBe(413);
    const bad = await api('post', '/api/activities').set('Content-Type', 'application/json').send('{"title":');
    expectError(bad, 400, 'validation_error');
    expect(JSON.stringify(bad.body)).not.toMatch(/SyntaxError|at |node_modules/);
  });

  it('sans session : toutes les routes /api/activities -> 401', async () => {
    for (const [m, u] of [['get', '/api/activities'], ['post', '/api/activities'], ['get', '/api/activities/x'], ['delete', '/api/activities/x']]) {
      const res = await request(ctx.app)[m](u).set('Origin', BASE_URL);
      expectError(res, 401, 'unauthenticated');
    }
  });
});

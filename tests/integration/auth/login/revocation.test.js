// Integration : revocation de session (users.token_version incremente au logout ; JWT porte `tv`).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { hasDb, makeApp, closeApp, resetData, createUser, login, expectError, BASE_URL } from '../../_support/harness.js';

describe.skipIf(!hasDb)('Auth - revocation de session', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await makeApp();
    await resetData(ctx.pool);
    await createUser(ctx.pool, { email: 'marie@club.fr', password: 'motdepasse-solide-1' });
  });
  afterAll(() => closeApp(ctx));

  it('apres logout, le cookie precedemment emis (copie) est refuse en 401, un nouveau login refonctionne', async () => {
    const stolen = await login(ctx.app, 'marie@club.fr', 'motdepasse-solide-1');
    const other = await login(ctx.app, 'marie@club.fr', 'motdepasse-solide-1');
    expect((await request(ctx.app).get('/api/auth/me').set('Cookie', stolen)).status).toBe(200);

    const out = await request(ctx.app).post('/api/auth/logout').set('Cookie', stolen).set('Origin', BASE_URL);
    expect(out.status).toBe(204);

    expectError(await request(ctx.app).get('/api/auth/me').set('Cookie', stolen), 401, 'unauthenticated');
    expectError(await request(ctx.app).get('/api/auth/me').set('Cookie', other), 401, 'unauthenticated'); // toutes les sessions du compte

    const fresh = await login(ctx.app, 'marie@club.fr', 'motdepasse-solide-1');
    expect((await request(ctx.app).get('/api/auth/me').set('Cookie', fresh)).status).toBe(200);
  });

  it('mutation avec cookie sid sans Origin -> 403 forbidden', async () => {
    const cookie = await login(ctx.app, 'marie@club.fr', 'motdepasse-solide-1');
    expectError(await request(ctx.app).post('/api/activities').set('Cookie', cookie).send({}), 403, 'forbidden');
  });
});

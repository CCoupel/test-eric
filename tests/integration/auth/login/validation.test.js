// Integration : validation du corps de POST /api/auth/login (400 validation_error).
import { describe, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { hasDb, makeApp, closeApp, resetData, expectError } from '../../_support/harness.js';

describe.skipIf(!hasDb)('Auth - validation du login', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await makeApp();
    await resetData(ctx.pool);
  });
  afterAll(() => closeApp(ctx));

  it.each([
    ['corps vide', {}],
    ['e-mail manquant', { password: 'motdepasse-solide-1' }],
    ['mot de passe manquant', { email: 'marie@club.fr' }],
    ['e-mail non texte', { email: 42, password: 'motdepasse-solide-1' }],
  ])('400 validation_error : %s', async (_nom, body) => {
    const res = await request(ctx.app).post('/api/auth/login').send(body);
    expectError(res, 400, 'validation_error');
  });
});

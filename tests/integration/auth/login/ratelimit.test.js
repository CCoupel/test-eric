// Integration : limitation de debit de POST /api/auth/login (contrat : 10 requetes/min/IP -> 429 rate_limited).
// Adresses distinctes par essai : le limiteur par e-mail (5 echecs / 15 min, rate-limit-email.test.js) ne doit pas masquer le limiteur par IP.
// Fichier isole : app neuve => compteur a zero, sans effet sur les autres fichiers.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { hasDb, makeApp, closeApp, resetData, createUser, expectError } from '../../_support/harness.js';

describe.skipIf(!hasDb)('Auth - rate limiting du login', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await makeApp();
    await resetData(ctx.pool);
    await createUser(ctx.pool, { email: 'marie@club.fr', password: 'motdepasse-solide-1' });
  });
  afterAll(() => closeApp(ctx));

  it('les 10 premiers essais sont traites (401), le 11e est refuse en 429 rate_limited', async () => {
    for (let i = 1; i <= 10; i++) {
      const res = await request(ctx.app).post('/api/auth/login').send({ email: `essai${i}@club.fr`, password: `faux-${i}` });
      expect(res.status, `essai ${i}`).toBe(401);
    }
    const res = await request(ctx.app).post('/api/auth/login').send({ email: 'marie@club.fr', password: 'faux-11' });
    expectError(res, 429, 'rate_limited');
  });

  it('un login correct est aussi refuse une fois la limite atteinte', async () => {
    const res = await request(ctx.app).post('/api/auth/login').send({ email: 'marie@club.fr', password: 'motdepasse-solide-1' });
    expect(res.status).toBe(429);
  });
});

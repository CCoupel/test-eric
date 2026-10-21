// Integration : limiteur de login par e-mail normalise (anti-bruteforce cible) : 5 echecs / 15 min, succes non comptes.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { hasDb, makeApp, closeApp, resetData, createUser, expectError } from '../../_support/harness.js';

describe.skipIf(!hasDb)('Auth - limiteur par e-mail', () => {
  let ctx;
  const attempt = (email, password) => request(ctx.app).post('/api/auth/login').send({ email, password });
  beforeAll(async () => {
    ctx = await makeApp();
    await resetData(ctx.pool);
    await createUser(ctx.pool, { email: 'cible@club.fr', password: 'motdepasse-solide-1' });
    await createUser(ctx.pool, { email: 'autre@club.fr', password: 'motdepasse-solide-2' });
  });
  afterAll(() => closeApp(ctx));

  it('les succes ne comptent pas', async () => {
    for (let i = 0; i < 3; i++) expect((await attempt('autre@club.fr', 'motdepasse-solide-2')).status).toBe(200);
  });

  it('apres 5 echecs sur un e-mail (casse/espaces ignores), le 6e essai est refuse en 429, meme avec le bon mot de passe', async () => {
    for (let i = 0; i < 5; i++) expect((await attempt(' Cible@Club.FR ', `faux-${i}`)).status).toBe(401);
    expectError(await attempt('cible@club.fr', 'motdepasse-solide-1'), 429, 'rate_limited');
  });

  it("un autre compte n'est pas affecte", async () => {
    expect((await attempt('autre@club.fr', 'motdepasse-solide-2')).status).toBe(200);
  });
});

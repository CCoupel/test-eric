// Integration : limitation du debit des envois par responsable (E7a). Limite abaissee a 3 via RATE_LIMIT_MAILING_PER_USER_10MIN.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hasDb, closeApp, expectError } from '../../_support/harness.js';
import { mailingSetup, mailEnv } from '../../_support/mailing.js';

describe.skipIf(!hasDb)('Mailing - rate limiting', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await mailingSetup({ env: mailEnv({ RATE_LIMIT_MAILING_PER_USER_10MIN: '3' }) });
  });
  afterAll(() => closeApp(ctx));

  it('les 3 premiers envois passent (201), le 4e est refuse en 429 rate_limited, aucun envoi cree', async () => {
    for (let i = 1; i <= 3; i++) expect((await ctx.send(ctx.body())).status, `envoi ${i}`).toBe(201);
    const { rows: avant } = await ctx.pool.query('SELECT count(*)::int AS n FROM mailings');
    expect(avant[0].n).toBe(3);
    expectError(await ctx.send(ctx.body()), 429, 'rate_limited');
    const { rows } = await ctx.pool.query('SELECT count(*)::int AS n FROM mailings');
    expect(rows[0].n).toBe(3);
  });

  it('les lectures (historique, apercu) ne sont pas limitees', async () => {
    for (let i = 0; i < 5; i++) expect((await ctx.api('get', '/api/mailings')).status).toBe(200);
  });
});

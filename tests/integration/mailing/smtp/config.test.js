// Integration : validation de la configuration SMTP au demarrage (E1, E5) et non-fuite des secrets.
import { describe, it, expect, afterEach } from 'vitest';
import { hasDb, makeApp, closeApp } from '../../_support/harness.js';
import { mailEnv, smtpEnv, SENTINELLE_PASS, MAIL_FROM } from '../../_support/mailing.js';
import { setup } from '../../_support/inscription.js';

describe.skipIf(!hasDb)('Mailing - configuration SMTP', () => {
  const ouverts = [];
  afterEach(async () => {
    while (ouverts.length) await closeApp(ouverts.pop());
  });

  it.each([
    ['SMTP_HOST sans MAIL_FROM', { SMTP_HOST: '127.0.0.1' }],
    ['MAIL_FROM sans SMTP_HOST', { MAIL_FROM }],
    ['SMTP_USER sans SMTP_PASS', { SMTP_HOST: '127.0.0.1', MAIL_FROM, SMTP_USER: 'robot' }],
    ['SMTP_PASS sans SMTP_USER', { SMTP_HOST: '127.0.0.1', MAIL_FROM, SMTP_PASS: SENTINELLE_PASS }],
    ['MAIL_FROM avec retour a la ligne', { SMTP_HOST: '127.0.0.1', MAIL_FROM: 'a@club.test\r\nBcc: pirate@evil.example' }],
    ['MAIL_FROM avec deux adresses', { SMTP_HOST: '127.0.0.1', MAIL_FROM: 'a@club.test, b@club.test' }],
    ['SMTP_PORT invalide', { SMTP_HOST: '127.0.0.1', MAIL_FROM, SMTP_PORT: '99999' }],
    ['SMTP_SECURE invalide', { SMTP_HOST: '127.0.0.1', MAIL_FROM, SMTP_SECURE: 'peut-etre' }],
  ])('demarrage refuse : %s', async (_nom, env) => {
    await expect(makeApp({ env: mailEnv(env) })).rejects.toThrow();
  });

  it('SMTP_HOST + MAIL_FROM : transport smtp ; sans eux : stub', async () => {
    const smtp = await makeApp({ env: smtpEnv(2525) });
    ouverts.push(smtp);
    const stub = await makeApp({ env: mailEnv() });
    ouverts.push(stub);
    expect(smtp.app.locals.pool).toBeDefined();
  });

  it('identifiants SMTP : jamais renvoyes par /api/mail/status ni presents dans les reponses', async () => {
    const ctx = await setup({ env: smtpEnv(2525, { SMTP_USER: 'robot-smtp', SMTP_PASS: SENTINELLE_PASS }) });
    ouverts.push(ctx);
    const res = await ctx.api('get', '/api/mail/status');
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(['from', 'transport']);
    expect(JSON.stringify(res.body)).not.toContain(SENTINELLE_PASS);
    expect(JSON.stringify(res.body)).not.toContain('robot-smtp');
  });
});

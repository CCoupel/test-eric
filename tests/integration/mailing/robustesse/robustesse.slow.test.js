// Integration (slow, scope security E7) : un seul envoi a la fois, continuite si le client se deconnecte,
// recuperation des envois orphelins au demarrage, plafonds de destinataires et envoi en arriere-plan.
import http from 'node:http';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hasDb, closeApp, expectConflict, makeApp, BASE_URL } from '../../_support/harness.js';
import { mailingSetup, smtpEnv, mailEnv, startSmtp, addRegs, waitFor, mailingRows, uniq } from '../../_support/mailing.js';

const statut = async (pool, id) => (await mailingRows(pool, id))?.status;

describe.skipIf(!hasDb)('Mailing - un envoi a la fois et continuite', () => {
  let ctx;
  let smtp;
  beforeAll(async () => {
    smtp = await startSmtp({ delayMs: 700 }); // latence : l'envoi dure ~1,4 s pour 2 destinataires
    ctx = await mailingSetup({ env: smtpEnv(smtp.port), emails: ['a@mail.fr', 'b@mail.fr'] });
  });
  afterAll(async () => {
    await closeApp(ctx);
    await smtp.close();
  });
  const enCours = () => ctx.pool.query("SELECT id FROM mailings WHERE status = 'sending'");

  it('409 mailing_in_progress pendant un envoi (aucun second envoi cree) ; envoi initial termine normalement', async () => {
    const premier = ctx.send(ctx.body({ subject: uniq('Premier') })).then((r) => r);
    await waitFor(async () => (await enCours()).rowCount > 0);
    const second = await ctx.send(ctx.body({ subject: uniq('Second') }));
    expectConflict(second, 'mailing_in_progress');
    const res = await premier;
    expect(res.status).toBe(201);
    expect(res.body.mailing.status).toBe('sent');
    expect(smtp.messages.length).toBeGreaterThanOrEqual(2);
    // le verrou est libere
    expect((await ctx.send(ctx.body({ subject: uniq('Troisieme') }))).status).toBe(201);
  });

  it('la deconnexion du client n\'interrompt pas la boucle : le statut est finalise', async () => {
    const avant = smtp.messages.length;
    const server = http.createServer(ctx.app);
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const { port } = server.address();
    const payload = JSON.stringify(ctx.body({ subject: uniq('Deconnexion') }));
    await new Promise((resolve) => {
      const req = http.request(
        { host: '127.0.0.1', port, path: '/api/mailings', method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), Cookie: ctx.cookie, Origin: BASE_URL } },
        () => {},
      );
      req.on('error', () => {});
      req.write(payload);
      req.end();
      setTimeout(() => { req.destroy(); resolve(); }, 250); // le client coupe pendant l'envoi
    });
    const { rows } = await waitFor(async () => {
      const r = await ctx.pool.query("SELECT id, status FROM mailings WHERE subject LIKE 'Deconnexion%'");
      return r.rows.length && r.rows[0].status !== 'sending' ? r : null;
    }, { timeout: 15000 });
    expect(rows[0].status).toBe('sent');
    expect(smtp.messages.length - avant).toBe(2);
    await new Promise((r) => server.close(r));
  });
});

describe.skipIf(!hasDb)('Mailing - recuperation des envois orphelins au demarrage', () => {
  it('un envoi reste "sending" apres un arret brutal passe en failed/partial, jamais repris automatiquement', async () => {
    const smtp = await startSmtp();
    const ctx = await mailingSetup({ env: smtpEnv(smtp.port), emails: ['a@mail.fr', 'b@mail.fr'] });
    const userId = (await ctx.api('get', '/api/auth/me')).body.user.id;
    const { rows: [m] } = await ctx.pool.query(
      `INSERT INTO mailings (subject, body, sender_id, status, recipients_count, sent_count, failed_count, transport, created_at)
       VALUES ('Orphelin', 'corps', $1, 'sending', 2, 0, 0, 'smtp', now()) RETURNING id`, [userId]);
    await ctx.pool.query(`INSERT INTO mailing_activities (mailing_id, activity_id) VALUES ($1, $2)`, [m.id, ctx.activity.id]);
    await closeApp(ctx);

    const redemarre = await makeApp({ env: smtpEnv(smtp.port) }); // "redemarrage" : nouvelle app sur la meme base
    try {
      const final = await waitFor(async () => {
        const s = await statut(redemarre.pool, m.id);
        return s && s !== 'sending' ? s : null;
      }, { timeout: 5000 });
      expect(['failed', 'partial']).toContain(final);
      await new Promise((r) => setTimeout(r, 500));
      expect(smtp.messages).toHaveLength(0); // aucune reprise automatique (risque de doublons)
    } finally {
      await closeApp(redemarre);
      await smtp.close();
    }
  });
});

describe.skipIf(!hasDb)('Mailing - plafonds', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await mailingSetup({
      env: mailEnv({ MAILING_MAX_RECIPIENTS: '4', MAILING_SYNC_MAX_RECIPIENTS: '2' }),
      emails: ['a@mail.fr', 'b@mail.fr', 'c@mail.fr'],
    });
  });
  afterAll(() => closeApp(ctx));

  it('au-dela de MAILING_MAX_RECIPIENTS : 409 too_many_recipients, rien d\'envoye ni cree', async () => {
    await addRegs(ctx.pool, ctx.activity.id, ['d@mail.fr', 'e@mail.fr']); // 5 > 4
    const avant = (await ctx.pool.query('SELECT count(*)::int AS n FROM mailings')).rows[0].n;
    expectConflict(await ctx.send(ctx.body()), 'too_many_recipients');
    expect((await ctx.pool.query('SELECT count(*)::int AS n FROM mailings')).rows[0].n).toBe(avant);
    await ctx.pool.query("DELETE FROM registrations WHERE contact_email IN ('d@mail.fr','e@mail.fr')");
  });

  it('au-dela de MAILING_SYNC_MAX_RECIPIENTS : 202 (envoi en arriere-plan), statut final atteint ensuite', async () => {
    const res = await ctx.send(ctx.body()); // 3 destinataires > 2
    expect(res.status).toBe(202);
    expect(res.body.mailing.status).toBe('sending');
    const final = await waitFor(async () => {
      const s = await statut(ctx.pool, res.body.mailing.id);
      return s && s !== 'sending' ? s : null;
    }, { timeout: 10000 });
    expect(final).toBe('sent');
  });
});

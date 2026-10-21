// Integration : verrou « un envoi a la fois », envoi en tache de fond (202), rate-limit, orphelins, desabonnement RFC 8058, purge.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { hasDb, closeApp, expectError, expectConflict } from '../_support/harness.js';
import { setup, newActivity, register } from '../_support/inscription.js';
import { captureLogs, fakeMailer, mailingBody, registerMany } from '../_support/envoi.js';

const tokenFrom = (message) => message.headers['List-Unsubscribe'].match(/unsubscribe\/([A-Za-z0-9_-]{43})/)[1];

describe.skipIf(!hasDb)('Envois groupes — controle de flux', () => {
  let ctx;
  let release;
  let mailer;
  let a;
  beforeAll(async () => {
    const gate = new Promise((r) => { release = r; });
    mailer = fakeMailer({ gate });
    ctx = await setup({ mailer, env: { RATE_LIMIT_REGISTRATION_PER_IP_MIN: '1000', RATE_LIMIT_MAILING_PER_USER_10MIN: '1000', MAILING_SYNC_MAX_RECIPIENTS: '2' } });
    a = await newActivity(ctx, { capacity: null });
    await registerMany(ctx, a, 4);
  });
  afterAll(async () => {
    release();
    await ctx.app.locals.mailings.drain();
    await closeApp(ctx);
  });

  it('au-dela du seuil synchrone : 202 immediat (statut sending), un 2e envoi pendant ce temps -> 409 mailing_in_progress, puis statut final', async () => {
    const first = await ctx.api('post', '/api/mailings').send(mailingBody([a.id], { subject: 'Long' }));
    expect(first.status).toBe(202);
    expect(first.body.mailing.status).toBe('sending');
    expectConflict(await ctx.api('post', '/api/mailings').send(mailingBody([a.id], { subject: 'Autre' })), 'mailing_in_progress');
    release();
    await ctx.app.locals.mailings.drain();
    const done = await ctx.api('get', `/api/mailings/${first.body.mailing.id}`);
    expect(done.body.mailing).toMatchObject({ status: 'sent', sent_count: 4, failed_count: 0 });
    expect(done.body.mailing.completed_at).not.toBeNull();
  });

  it('recoverOrphans : un envoi reste « sending » est clos (partial/failed), jamais repris', async () => {
    const { rows: [m] } = await ctx.pool.query(
      `INSERT INTO mailings (subject, body, sender_id, status, recipients_count, transport) VALUES ('Orphelin','x',(SELECT id FROM users LIMIT 1),'sending',3,'smtp') RETURNING id`,
    );
    await ctx.pool.query(`INSERT INTO mailing_recipients (mailing_id, email, status) VALUES ($1,'x1@mail.fr','sent'), ($1,'x2@mail.fr','failed')`, [m.id]);
    const before = mailer.sent.length;
    await ctx.app.locals.mailings.recoverOrphans();
    const { rows: [r] } = await ctx.pool.query('SELECT status, sent_count, failed_count, completed_at FROM mailings WHERE id = $1', [m.id]);
    expect(r).toMatchObject({ status: 'partial', sent_count: 1, failed_count: 2 });
    expect(r.completed_at).not.toBeNull();
    expect(mailer.sent.length).toBe(before); // aucune reprise automatique
  });
});

describe.skipIf(!hasDb)('Envois groupes — rate-limit et plafond', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await setup({ mailer: fakeMailer(), env: { RATE_LIMIT_REGISTRATION_PER_IP_MIN: '1000', RATE_LIMIT_MAILING_PER_USER_10MIN: '2', MAILING_MAX_RECIPIENTS: '3' } });
  });
  afterAll(() => closeApp(ctx));

  it('plafond de destinataires : 409 too_many_recipients ; limite par responsable : 429 rate_limited au 3e POST', async () => {
    const big = await newActivity(ctx, { capacity: null, title: 'Gros' });
    await registerMany(ctx, big, 4);
    const small = await newActivity(ctx, { capacity: null, title: 'Petit' });
    await registerMany(ctx, small, 2, 's');
    const post = (ids, subject) => ctx.api('post', '/api/mailings').send(mailingBody(ids, { subject }));
    expectConflict(await post([big.id], 'Trop'), 'too_many_recipients');
    expect((await post([small.id], 'Ok 1')).status).toBe(201);
    expectError(await post([small.id], 'Ok 2'), 429, 'rate_limited');
  });
});

describe.skipIf(!hasDb)('Desabonnement en un clic (RFC 8058)', () => {
  let ctx;
  let mailer;
  let logs;
  let a1;
  let a2;
  let other;
  const send = async (ids, subject) => {
    mailer.sent.length = 0;
    const res = await ctx.api('post', '/api/mailings').send(mailingBody(ids, { subject }));
    expect(res.status).toBe(201);
    return mailer.bulk();
  };
  const count = async (id) => (await ctx.pool.query('SELECT count(*)::int AS n FROM registrations WHERE activity_id = $1', [id])).rows[0].n;

  beforeAll(async () => {
    mailer = fakeMailer();
    logs = captureLogs();
    ctx = await setup({ mailer, logger: logs.logger, env: { RATE_LIMIT_REGISTRATION_PER_IP_MIN: '1000', RATE_LIMIT_MAILING_PER_USER_10MIN: '1000' } });
    a1 = await newActivity(ctx, { capacity: null, title: 'Judo' });
    a2 = await newActivity(ctx, { capacity: null, title: 'Karate' });
    other = await newActivity(ctx, { capacity: null, title: 'Natation' });
    await registerMany(ctx, a1, 2, 'u');
    await register(ctx, a2.public_slug, { participant_name: 'Fratrie', contact_name: 'Parent u1', contact_email: 'u1@mail.fr' });
    await register(ctx, other.public_slug, { participant_name: 'Hors envoi', contact_name: 'Parent u1', contact_email: 'u1@mail.fr' });
  });
  afterAll(() => closeApp(ctx));

  it('GET (non mutant) decrit les activites ; POST sans Origin ni cookie (one-click du client mail) desinscrit des activites de CET envoi seulement', async () => {
    const bulk = await send([a1.id, a2.id], 'Desabo 1');
    const m = bulk.find((b) => b.to === 'u1@mail.fr');
    const token = tokenFrom(m);
    const info = await request(ctx.app).get(`/api/public/unsubscribe/${token}`);
    expect(info.status).toBe(200);
    expect(info.body.activities.map((x) => x.title).sort()).toEqual(['Judo', 'Karate']);
    expect(info.headers['cache-control']).toBe('no-store');
    expect(await count(a1.id)).toBe(2); // le GET n'a rien supprime

    const res = await request(ctx.app).post(`/api/public/unsubscribe/${token}`).type('form').send('List-Unsubscribe=One-Click');
    expect(res.status).toBe(204);
    expect(await count(a1.id)).toBe(1); // u2 reste
    expect(await count(a2.id)).toBe(0);
    expect(await count(other.id)).toBe(1); // activite hors de cet envoi : conservee
    const { rows } = await ctx.pool.query("SELECT email, error, unsubscribe_token_hash AS h FROM mailing_recipients WHERE email IS NULL");
    expect(rows.length).toBeGreaterThan(0);
  });

  it('token a usage unique et uniforme : 404 apres usage (GET et POST), 404 pour token inconnu/malforme', async () => {
    const bulk = await send([a1.id], 'Desabo 2');
    const token = tokenFrom(bulk.find((b) => b.to === 'u2@mail.fr'));
    expect((await request(ctx.app).post(`/api/public/unsubscribe/${token}`)).status).toBe(204);
    const bodies = [];
    for (const [m, t] of [['post', token], ['get', token], ['get', 'A'.repeat(43)], ['post', 'inconnu'], ['get', '%00'], ['post', 'A'.repeat(500)]]) {
      const res = await request(ctx.app)[m](`/api/public/unsubscribe/${encodeURIComponent(t)}`);
      expectError(res, 404, 'not_found');
      bodies.push(JSON.stringify(res.body));
    }
    expect(new Set(bodies).size).toBe(1);
  });

  it('Origin etranger refuse sur le POST (CSRF) ; token masque dans les journaux', async () => {
    await register(ctx, a1.public_slug, { participant_name: 'Nouveau', contact_email: 'n@mail.fr' });
    const token = tokenFrom((await send([a1.id], 'Desabo 3')).find((b) => b.to === 'n@mail.fr'));
    expectError(await request(ctx.app).post(`/api/public/unsubscribe/${token}`).set('Origin', 'https://evil.example'), 403, 'forbidden');
    expect(await count(a1.id)).toBe(1);
    await request(ctx.app).get(`/u/${token}`);
    expect(logs.text()).not.toContain(token);
  });

  it('une desinscription via /r/:token invalide aussi les liens de desabonnement deja envoyes', async () => {
    await register(ctx, a2.public_slug, { participant_name: 'Perdu', contact_email: 'perdu@mail.fr' });
    const token = tokenFrom((await send([a2.id], 'Desabo 4')).find((b) => b.to === 'perdu@mail.fr'));
    const { rows } = await ctx.pool.query("SELECT id FROM registrations WHERE contact_email = 'perdu@mail.fr'");
    expect((await ctx.api('delete', `/api/activities/${a2.id}/registrations/${rows[0].id}`)).status).toBe(204);
    expectError(await request(ctx.app).get(`/api/public/unsubscribe/${token}`), 404, 'not_found');
  });
});

describe.skipIf(!hasDb)('Purge de l’historique d’envois (RETENTION_MONTHS)', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await setup({ mailer: fakeMailer() });
  });
  afterAll(() => closeApp(ctx));

  it('supprime les envois plus vieux que la retention (cascade destinataires/activites), conserve les recents, idempotent', async () => {
    const { purgeExpired } = await import('../../../src/server/services/registrations.js');
    const act = await newActivity(ctx, { capacity: null });
    const mk = async (age) => {
      const { rows: [m] } = await ctx.pool.query(
        `INSERT INTO mailings (subject, body, sender_id, status, recipients_count, transport, created_at) VALUES ('S','B',(SELECT id FROM users LIMIT 1),'sent',1,'smtp', now() - $1::interval) RETURNING id`,
        [age],
      );
      await ctx.pool.query('INSERT INTO mailing_activities (mailing_id, activity_id) VALUES ($1,$2)', [m.id, act.id]);
      await ctx.pool.query("INSERT INTO mailing_recipients (mailing_id, email, status) VALUES ($1,'x@mail.fr','sent')", [m.id]);
      return m.id;
    };
    const old = await mk('14 months');
    const recent = await mk('1 month');
    const r = await purgeExpired(ctx.pool, { retentionMonths: 12 });
    expect(r.mailingsDeleted).toBe(1);
    expect((await ctx.pool.query('SELECT id FROM mailings')).rows.map((x) => x.id)).toEqual([recent]);
    expect((await ctx.pool.query('SELECT count(*)::int AS n FROM mailing_recipients WHERE mailing_id = $1', [old])).rows[0].n).toBe(0);
    expect((await purgeExpired(ctx.pool, { retentionMonths: 12 })).mailingsDeleted).toBe(0);
  });
});

describe.skipIf(!hasDb)('E-mail de confirmation — plafond par adresse', () => {
  let ctx;
  let mailer;
  let logs;
  let act;
  beforeAll(async () => {
    mailer = fakeMailer();
    logs = captureLogs();
    ctx = await setup({ mailer, logger: logs.logger, env: { RATE_LIMIT_REGISTRATION_PER_IP_MIN: '1000', RATE_LIMIT_CONFIRMATION_PER_ADDRESS_HOUR: '2' } });
    act = await newActivity(ctx, { capacity: null });
  });
  afterAll(() => closeApp(ctx));

  it('au-dela de 2 confirmations par adresse : inscription acceptee (201) mais aucun e-mail, journal sans adresse ; autre adresse non affectee', async () => {
    for (let i = 1; i <= 4; i++) {
      expect((await register(ctx, act.public_slug, { participant_name: `Enfant ${i}`, contact_email: 'victime@mail.fr' })).status).toBe(201);
    }
    expect((await register(ctx, act.public_slug, { participant_name: 'Autre', contact_email: 'autre@mail.fr' })).status).toBe(201);
    await new Promise((r) => setTimeout(r, 100));
    const toVictime = mailer.confirmations().filter((m) => m.to === 'victime@mail.fr');
    expect(toVictime).toHaveLength(2);
    expect(mailer.confirmations().filter((m) => m.to === 'autre@mail.fr')).toHaveLength(1);
    expect((await ctx.pool.query("SELECT count(*)::int AS n FROM registrations WHERE contact_email = 'victime@mail.fr'")).rows[0].n).toBe(4);
    expect(logs.text()).toContain('confirmation_mail_skipped');
    expect(logs.text()).not.toContain('victime@mail.fr');
  });
});

describe.skipIf(!hasDb)('Envoi groupe — disjoncteur SMTP', () => {
  let ctx;
  let mailer;
  beforeAll(async () => {
    mailer = fakeMailer();
    ctx = await setup({ mailer, env: { RATE_LIMIT_REGISTRATION_PER_IP_MIN: '1000' } });
  });
  afterAll(() => closeApp(ctx));

  it('apres 5 echecs consecutifs de connexion, le reste est interrompu (failed/interrupted) sans insister', async () => {
    const act = await newActivity(ctx, { capacity: null });
    await registerMany(ctx, act, 8);
    let calls = 0;
    mailer.send = async (m) => {
      if (!m.headers?.['List-Unsubscribe']) return; // confirmations d'inscription : ignorees
      calls += 1;
      throw Object.assign(new Error('mail_failed'), { code: 'connection' });
    };
    const res = await ctx.api('post', '/api/mailings').send(mailingBody([act.id], { subject: 'SMTP KO' }));
    expect(res.status).toBe(201);
    expect(res.body.mailing).toMatchObject({ status: 'failed', sent_count: 0, failed_count: 8 });
    expect(calls).toBe(5);
    const detail = await ctx.api('get', `/api/mailings/${res.body.mailing.id}`);
    expect(detail.body.recipients).toHaveLength(8);
    expect(detail.body.recipients.filter((r) => r.error === 'interrupted')).toHaveLength(3);
    expect(detail.body.recipients.filter((r) => r.error === 'connection')).toHaveLength(5);
  });
});

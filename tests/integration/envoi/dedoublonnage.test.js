// Integration : un seul message par adresse e-mail normalisee, toutes inscriptions/activites de l'envoi confondues.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { hasDb, closeApp } from '../_support/harness.js';
import { setup, newActivity, register } from '../_support/inscription.js';
import { fakeMailer, mailingBody } from '../_support/envoi.js';

const tokenFrom = (message) => message.headers['List-Unsubscribe'].match(/unsubscribe\/([A-Za-z0-9_-]{43})/)[1];

describe.skipIf(!hasDb)('Envois groupes — une seule ligne par adresse', () => {
  let ctx;
  let mailer;
  let a1;
  let a2;
  const count = async (id) => (await ctx.pool.query('SELECT count(*)::int AS n FROM registrations WHERE activity_id = $1', [id])).rows[0].n;

  beforeAll(async () => {
    mailer = fakeMailer();
    ctx = await setup({ mailer, env: { RATE_LIMIT_REGISTRATION_PER_IP_MIN: '1000', RATE_LIMIT_MAILING_PER_USER_10MIN: '1000' } });
    a1 = await newActivity(ctx, { capacity: null, title: 'Judo' });
    a2 = await newActivity(ctx, { capacity: null, title: 'Karate' });
    // Parent avec DEUX enfants dans la meme activite (casse et espaces de l'adresse differents), plus un enfant dans une 2e activite.
    await register(ctx, a1.public_slug, { participant_name: 'Lea', contact_email: 'parent@mail.fr' });
    await register(ctx, a1.public_slug, { participant_name: 'Tom', contact_email: ' Parent@Mail.FR ' });
    await register(ctx, a2.public_slug, { participant_name: 'Zoe', contact_email: 'PARENT@mail.fr' });
    await register(ctx, a1.public_slug, { participant_name: 'Max', contact_email: 'autre@mail.fr' });
  });
  afterAll(() => closeApp(ctx));

  it('apercu et envoi : 2 adresses distinctes => 2 destinataires, 2 messages, 2 lignes d’historique', async () => {
    const preview = await ctx.api('get', `/api/mailings/recipients-preview?activity_ids=${a1.id},${a2.id}`);
    expect(preview.body.recipients_count).toBe(2);
    expect(preview.body.by_activity).toEqual(expect.arrayContaining([{ id: a1.id, title: 'Judo', count: 2 }, { id: a2.id, title: 'Karate', count: 1 }]));
    mailer.sent.length = 0;
    const res = await ctx.api('post', '/api/mailings').send(mailingBody([a1.id, a2.id], { subject: 'Dedoublonnage' }));
    expect(res.status).toBe(201);
    expect(res.body.mailing).toMatchObject({ recipients_count: 2, sent_count: 2, failed_count: 0 });
    const bulk = mailer.bulk();
    expect(bulk.map((b) => b.to).sort()).toEqual(['autre@mail.fr', 'parent@mail.fr']);
    const detail = await ctx.api('get', `/api/mailings/${res.body.mailing.id}`);
    expect(detail.body.recipients).toHaveLength(2);
    const { rows } = await ctx.pool.query('SELECT email, unsubscribe_token_hash AS h FROM mailing_recipients');
    expect(new Set(rows.map((r) => r.email)).size).toBe(2);
  });

  it('le lien de desabonnement du parent couvre TOUTES ses inscriptions des activites de l’envoi', async () => {
    mailer.sent.length = 0;
    await ctx.api('post', '/api/mailings').send(mailingBody([a1.id, a2.id], { subject: 'Dedoublonnage 2' }));
    const token = tokenFrom(mailer.bulk().find((b) => b.to === 'parent@mail.fr'));
    const info = await request(ctx.app).get(`/api/public/unsubscribe/${token}`);
    expect(info.body.activities.map((a) => a.title).sort()).toEqual(['Judo', 'Karate']);
    expect((await request(ctx.app).post(`/api/public/unsubscribe/${token}`)).status).toBe(204);
    expect(await count(a1.id)).toBe(1); // seul « autre » reste
    expect(await count(a2.id)).toBe(0);
  });
});

describe.skipIf(!hasDb)('Envois groupes — adresse partagee entre plusieurs inscriptions', () => {
  let ctx;
  let mailer;
  let act;
  beforeAll(async () => {
    mailer = fakeMailer();
    ctx = await setup({ mailer, env: { RATE_LIMIT_REGISTRATION_PER_IP_MIN: '1000', RATE_LIMIT_MAILING_PER_USER_10MIN: '1000' } });
    act = await newActivity(ctx, { capacity: null });
  });
  afterAll(() => closeApp(ctx));

  it('retirer UN enfant garde l’adresse et le lien de desabonnement valides ; retirer le dernier efface l’adresse et invalide le lien', async () => {
    const lea = (await register(ctx, act.public_slug, { participant_name: 'Lea', contact_email: 'parent@mail.fr' })).body.registration.id;
    const tom = (await register(ctx, act.public_slug, { participant_name: 'Tom', contact_email: 'parent@mail.fr' })).body.registration.id;
    mailer.sent.length = 0;
    const sent = await ctx.api('post', '/api/mailings').send(mailingBody([act.id], { subject: 'Adresse partagee' }));
    expect(sent.body.mailing.recipients_count).toBe(1);
    const token = tokenFrom(mailer.bulk()[0]);

    expect((await ctx.api('delete', `/api/activities/${act.id}/registrations/${lea}`)).status).toBe(204);
    const rcpt = await ctx.pool.query('SELECT email, unsubscribe_token_hash AS h FROM mailing_recipients');
    expect(rcpt.rows[0].email).toBe('parent@mail.fr'); // Tom reste inscrit avec cette adresse
    expect(rcpt.rows[0].h).not.toBeNull();
    expect((await request(ctx.app).get(`/api/public/unsubscribe/${token}`)).status).toBe(200);

    expect((await ctx.api('delete', `/api/activities/${act.id}/registrations/${tom}`)).status).toBe(204);
    const after = await ctx.pool.query('SELECT email, error, unsubscribe_token_hash AS h, registration_id FROM mailing_recipients');
    expect(after.rows[0]).toEqual({ email: null, error: null, h: null, registration_id: null });
    expect((await request(ctx.app).get(`/api/public/unsubscribe/${token}`)).status).toBe(404);
  });
});

describe.skipIf(!hasDb)('Envois groupes — adultes de meme adresse (repro QUALIF 0.1.0.6)', () => {
  let ctx;
  let mailer;
  let act;
  beforeAll(async () => {
    mailer = fakeMailer();
    ctx = await setup({ mailer, env: { RATE_LIMIT_REGISTRATION_PER_IP_MIN: '1000', RATE_LIMIT_MAILING_PER_USER_10MIN: '1000' } });
    act = await newActivity(ctx, { capacity: 20 });
  });
  afterAll(() => closeApp(ctx));

  it('Alice Test + Bob + Alice Bis (meme e-mail, adultes) => 2 destinataires, 2 messages, 2 lignes', async () => {
    const adult = (name, email) => register(ctx, act.public_slug, { participant_name: name, is_minor: false, contact_name: undefined, contact_email: email });
    expect((await adult('Alice Test', 'alice@domaine.test')).status).toBe(201);
    expect((await adult('Bob Test', 'bob@autre-domaine.test')).status).toBe(201);
    expect((await adult('Alice Bis', 'alice@domaine.test')).status).toBe(201);
    const preview = await ctx.api('get', `/api/mailings/recipients-preview?activity_ids=${act.id}`);
    expect(preview.body.recipients_count).toBe(2);
    mailer.sent.length = 0;
    const res = await ctx.api('post', '/api/mailings').send(mailingBody([act.id], { subject: 'Adultes' }));
    expect(res.body.mailing).toMatchObject({ recipients_count: 2, sent_count: 2 });
    expect(mailer.bulk().map((b) => b.to).sort()).toEqual(['alice@domaine.test', 'bob@autre-domaine.test']);
    expect((await ctx.api('get', `/api/mailings/${res.body.mailing.id}`)).body.recipients).toHaveLength(2);
  });

  it('deux adultes de meme e-mail ET meme nom (casse differente) dans une activite : 409 already_registered', async () => {
    expect((await register(ctx, act.public_slug, { participant_name: 'Clara Dup', is_minor: false, contact_email: 'clara@domaine.test' })).status).toBe(201);
    const dup = await register(ctx, act.public_slug, { participant_name: 'CLARA dup', is_minor: false, contact_email: 'Clara@Domaine.Test' });
    expect(dup.status).toBe(409);
    expect(dup.body.message).toContain('already_registered');
  });
});

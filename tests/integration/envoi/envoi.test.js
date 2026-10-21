// Integration : e-mails groupes (POST /api/mailings & co) avec un faux mailer injecte.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { hasDb, closeApp, expectError, expectConflict, BASE_URL } from '../_support/harness.js';
import { setup, newActivity, register } from '../_support/inscription.js';
import { captureLogs, fakeMailer, mailingBody, registerMany } from '../_support/envoi.js';

describe.skipIf(!hasDb)('Envois groupes', () => {
  let ctx;
  let mailer;
  let originalSend;
  let logs;
  let a1;
  let a2;
  const post = (body) => ctx.api('post', '/api/mailings').send(body);
  const reset = () => ctx.pool.query('TRUNCATE mailings CASCADE');

  beforeAll(async () => {
    mailer = fakeMailer();
    originalSend = mailer.send;
    logs = captureLogs();
    ctx = await setup({ mailer, logger: logs.logger, env: { RATE_LIMIT_MAILING_PER_USER_10MIN: '1000', RATE_LIMIT_REGISTRATION_PER_IP_MIN: '1000' } });
    a1 = await newActivity(ctx, { capacity: null, title: 'Judo <enfants>' });
    a2 = await newActivity(ctx, { capacity: null, title: 'Karaté' });
    await registerMany(ctx, a1, 3, 'a');
    await register(ctx, a2.public_slug, { participant_name: 'Fratrie', contact_name: 'Parent a1', contact_email: 'a1@mail.fr' }); // meme e-mail que a1 (dedoublonnage)
    await registerMany(ctx, a2, 1, 'b');
  });
  afterAll(() => closeApp(ctx));

  describe('recipients-preview', () => {
    it('compteurs dedoublonnes, aucune adresse', async () => {
      const res = await ctx.api('get', `/api/mailings/recipients-preview?activity_ids=${a1.id},${a2.id}`);
      expect(res.status).toBe(200);
      expect(res.body.recipients_count).toBe(4); // a1,a2,a3 + b1 (a1 present dans les deux activites)
      expect(res.body.by_activity).toEqual(expect.arrayContaining([{ id: a1.id, title: a1.title, count: 3 }, { id: a2.id, title: 'Karaté', count: 2 }]));
      expect(JSON.stringify(res.body)).not.toContain('@');
    });
    it('negatifs : sans session 401, id invalide 400, inconnu 404, champ en trop 400', async () => {
      expectError(await request(ctx.app).get(`/api/mailings/recipients-preview?activity_ids=${a1.id}`), 401, 'unauthenticated');
      expectError(await ctx.api('get', '/api/mailings/recipients-preview?activity_ids=abc'), 400, 'validation_error');
      expectError(await ctx.api('get', '/api/mailings/recipients-preview'), 400, 'validation_error');
      expectError(await ctx.api('get', '/api/mailings/recipients-preview?activity_ids=00000000-0000-4000-8000-000000000000'), 404, 'not_found');
      expectError(await ctx.api('get', `/api/mailings/recipients-preview?activity_ids=${a1.id}&x=1`), 400, 'validation_error');
    });
  });

  describe('POST /api/mailings', () => {
    it('201 : un message par destinataire dedoublonne, To unique, From/headers, HTML echappe, historique persistant', async () => {
      await reset();
      mailer.sent.length = 0;
      const res = await post(mailingBody([a1.id, a2.id], { subject: 'Sortie', body: 'Salut <script>alert(1)</script>' }));
      expect(res.status).toBe(201);
      const m = res.body.mailing;
      expect(m).toMatchObject({ status: 'sent', transport: 'smtp', recipients_count: 4, sent_count: 4, failed_count: 0 });
      expect(m.sender.name).toBe('Marie Dupont');
      expect(m.activities.map((a) => a.title).sort()).toEqual(['Judo <enfants>', 'Karaté']);
      const bulk = mailer.bulk();
      expect(bulk).toHaveLength(4);
      expect(new Set(bulk.map((b) => b.to)).size).toBe(4);
      for (const b of bulk) {
        expect(Object.keys(b)).not.toEqual(expect.arrayContaining(['bcc', 'cc', 'from']));
        expect(b.html).toContain('&lt;script&gt;');
        expect(b.html).not.toContain('<script>');
        expect(b.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
        expect(b.headers['List-Unsubscribe']).toMatch(new RegExp(`^<${BASE_URL}/api/public/unsubscribe/[A-Za-z0-9_-]{43}>`));
      }
      expect(new Set(bulk.map((b) => b.headers['List-Unsubscribe'])).size).toBe(4); // token propre a chaque message
      const detail = await ctx.api('get', `/api/mailings/${m.id}`);
      expect(detail.status).toBe(200);
      expect(detail.body.recipients).toHaveLength(4);
      expect(detail.body.recipients.every((r) => r.status === 'sent' && r.error === null)).toBe(true);
      expect(detail.body.mailing.body).toContain('Salut');
      const list = await ctx.api('get', '/api/mailings');
      expect(list.body.mailings[0]).not.toHaveProperty('body');
    });

    it('les tokens de desabonnement ne sont stockes que haches', async () => {
      const { rows } = await ctx.pool.query('SELECT unsubscribe_token_hash AS h FROM mailing_recipients');
      for (const { h } of rows) expect(h).toMatch(/^[0-9a-f]{64}$/);
      const tokens = mailer.bulk().map((b) => b.headers['List-Unsubscribe'].match(/unsubscribe\/([A-Za-z0-9_-]{43})/)[1]);
      for (const t of tokens) expect((await ctx.pool.query('SELECT 1 FROM mailing_recipients WHERE unsubscribe_token_hash = $1', [t])).rowCount).toBe(0);
    });

    it('partial si un destinataire echoue : error = code grossier sans adresse', async () => {
      await reset();
      const failing = fakeMailer({ failFor: ['a2@mail.fr'] });
      mailer.send = failing.send; // remplace le transport de l'app de test (meme objet que celui injecte)
      const res = await post(mailingBody([a1.id], { subject: 'Partiel' }));
      expect(res.status).toBe(201);
      expect(res.body.mailing).toMatchObject({ status: 'partial', sent_count: 2, failed_count: 1 });
      const detail = await ctx.api('get', `/api/mailings/${res.body.mailing.id}`);
      const bad = detail.body.recipients.find((r) => r.status === 'failed');
      expect(bad.error).toBe('rejected');
      mailer.send = originalSend;
    });

    it('409 no_recipients ; 404 activite inconnue ; 409 too_many_recipients', async () => {
      await reset();
      const vide = await newActivity(ctx, { capacity: null, title: 'Vide' });
      expectConflict(await post(mailingBody([vide.id])), 'no_recipients');
      expectError(await post(mailingBody(['00000000-0000-4000-8000-000000000000'])), 404, 'not_found');
    });

    it('409 duplicate_mailing (meme envoi < 5 min), mais un autre sujet passe', async () => {
      await reset();
      const body = mailingBody([a2.id], { subject: 'Rappel unique' });
      expect((await post(body)).status).toBe(201);
      expectConflict(await post(body), 'duplicate_mailing');
      expect((await post({ ...body, subject: 'Rappel unique 2' })).status).toBe(201);
    });

    it('negatifs de validation : CRLF dans le sujet, champs inconnus (From/Bcc), listes et tailles', async () => {
      const ok = mailingBody([a1.id], { subject: 'x' });
      for (const bad of [
        { ...ok, subject: 'a\r\nBcc: victime@mail.fr' },
        { ...ok, subject: 'a\nb' },
        { ...ok, subject: '' },
        { ...ok, subject: 'x'.repeat(201) },
        { ...ok, body: '' },
        { ...ok, body: 'x'.repeat(20_001) },
        { ...ok, body: 'a\u0000b' },
        { ...ok, from: 'evil@evil.example' },
        { ...ok, bcc: 'victime@mail.fr' },
        { ...ok, headers: { 'X-Evil': '1' } },
        { ...ok, activity_ids: [] },
        { ...ok, activity_ids: [a1.id, a1.id] },
        { ...ok, activity_ids: ['abc'] },
        { ...ok, activity_ids: Array.from({ length: 21 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`) },
        { subject: 'x', body: 'y' },
        'pas du json',
      ]) {
        const res = await post(bad);
        expect(res.status, JSON.stringify(bad).slice(0, 80)).toBe(400);
      }
    });

    it('401 sans session ; 403 Origin etranger, ou absent avec cookie', async () => {
      expectError(await request(ctx.app).post('/api/mailings').set('Origin', BASE_URL).send(mailingBody([a1.id])), 401, 'unauthenticated');
      expectError(await request(ctx.app).post('/api/mailings').set('Cookie', ctx.cookie).set('Origin', 'https://evil.example').send(mailingBody([a1.id])), 403, 'forbidden');
      expectError(await request(ctx.app).post('/api/mailings').set('Cookie', ctx.cookie).send(mailingBody([a1.id])), 403, 'forbidden');
    });
  });

  describe('GET /api/mailings/:id & /api/mail/status', () => {
    it('404 inconnu/malforme, 401 sans session, acces trace sans donnees personnelles', async () => {
      await reset();
      const created = (await post(mailingBody([a1.id], { subject: 'Pour le journal' }))).body.mailing;
      expectError(await ctx.api('get', '/api/mailings/00000000-0000-4000-8000-000000000000'), 404, 'not_found');
      expectError(await ctx.api('get', '/api/mailings/abc'), 404, 'not_found');
      expectError(await request(ctx.app).get(`/api/mailings/${created.id}`), 401, 'unauthenticated');
      await ctx.api('get', `/api/mailings/${created.id}`);
      expect(logs.text()).toContain('mailing_viewed');
    });
    it('status : {transport, from} uniquement, session requise', async () => {
      const res = await ctx.api('get', '/api/mail/status');
      expect(res.body).toEqual({ transport: 'smtp', from: 'Club <no-reply@club.example>' });
      expectError(await request(ctx.app).get('/api/mail/status'), 401, 'unauthenticated');
    });
  });

  it('journaux : aucune adresse e-mail, aucun corps, aucun token de desabonnement', () => {
    const text = logs.text();
    expect(text).not.toMatch(/p\d@mail\.fr|a\d@mail\.fr|b1@mail\.fr/);
    expect(text).not.toContain('Rendez-vous 9 h');
    expect(text).not.toMatch(/unsubscribe\/[A-Za-z0-9_-]{43}/);
    expect(text).toContain('mailing_sent');
  });

  it('e-mail de confirmation d’inscription : envoye au parent, avec lien de gestion, jamais journalise', async () => {
    mailer.sent.length = 0;
    const res = await register(ctx, a1.public_slug, { participant_name: 'Nouveau', contact_email: 'nouveau@mail.fr' });
    expect(res.status).toBe(201);
    await new Promise((r) => setTimeout(r, 50));
    const [conf] = mailer.confirmations();
    expect(conf.to).toBe('nouveau@mail.fr');
    expect(conf.text).toContain(res.body.manage_url);
    expect(logs.text()).not.toContain(res.body.manage_url.split('/r/')[1]);
    expect(logs.text()).not.toContain('nouveau@mail.fr');
  });
});

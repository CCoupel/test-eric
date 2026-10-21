// Integration : envoi groupe en mode stub (SMTP non configure) — contracts/http-endpoints.md, section E-mails groupes.
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hasDb, closeApp, expectError, expectConflict } from '../../_support/harness.js';
import { newActivity } from '../../_support/inscription.js';
import { mailingSetup, addRegs, uniq } from '../../_support/mailing.js';

describe.skipIf(!hasDb)('Mailing - envoi (stub)', () => {
  let ctx;
  let autre; // 2e activite : b@ (doublon) + c@
  beforeAll(async () => {
    ctx = await mailingSetup({ emails: ['a@mail.fr', 'b@mail.fr'] });
    autre = await newActivity(ctx, { capacity: null, title: 'Sortie tournoi regional' });
    await addRegs(ctx.pool, autre.id, ['b@mail.fr', 'c@mail.fr']);
  });
  afterAll(() => closeApp(ctx));

  describe('401 sans session', () => {
    it.each([
      ['get', '/api/mailings'],
      ['post', '/api/mailings'],
      ['get', '/api/mailings/00000000-0000-4000-8000-000000000000'],
      ['get', '/api/mailings/recipients-preview?activity_ids=00000000-0000-4000-8000-000000000000'],
      ['get', '/api/mail/status'],
    ])('%s %s', async (method, url) => {
      expectError(await request(ctx.app)[method](url).send({}), 401, 'unauthenticated');
    });
  });

  describe('GET /api/mail/status', () => {
    it('stub : { transport: "stub", from: null } — rien d\'autre', async () => {
      const res = await ctx.api('get', '/api/mail/status');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ transport: 'stub', from: null });
    });
  });

  describe('GET /api/mailings/recipients-preview', () => {
    it('compteurs dedupliques sur l\'union des activites, par activite, sans aucune adresse', async () => {
      const res = await ctx.api('get', `/api/mailings/recipients-preview?activity_ids=${ctx.activity.id},${autre.id}`);
      expect(res.status).toBe(200);
      expect(res.body.recipients_count).toBe(3); // a, b (dedoublonne), c
      expect(res.body.by_activity).toEqual(expect.arrayContaining([
        { id: ctx.activity.id, title: 'Stage judo Toussaint', count: 2 },
        { id: autre.id, title: 'Sortie tournoi regional', count: 2 },
      ]));
      expect(JSON.stringify(res.body)).not.toMatch(/@/);
    });

    it('activite sans inscrit : 0', async () => {
      const vide = await newActivity(ctx, { title: 'Vide' });
      const res = await ctx.api('get', `/api/mailings/recipients-preview?activity_ids=${vide.id}`);
      expect(res.body.recipients_count).toBe(0);
    });

    it('404 si une activite est inconnue', async () => {
      const res = await ctx.api('get', `/api/mailings/recipients-preview?activity_ids=${ctx.activity.id},00000000-0000-4000-8000-000000000000`);
      expectError(res, 404, 'not_found');
    });

    it.each([
      ['activity_ids absent', ''],
      ['activity_ids vide', '?activity_ids='],
      ['identifiant non uuid', '?activity_ids=abc'],
      ['doublons', '?activity_ids=00000000-0000-4000-8000-000000000001,00000000-0000-4000-8000-000000000001'],
      ['plus de 20 identifiants', `?activity_ids=${Array.from({ length: 21 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`).join(',')}`],
    ])('400 validation_error : %s', async (_nom, qs) => {
      expectError(await ctx.api('get', `/api/mailings/recipients-preview${qs}`), 400, 'validation_error');
    });
  });

  describe('POST /api/mailings (stub)', () => {
    it('201 : un envoi, destinataires dedupliques, statut final, transport stub, historique ecrit', async () => {
      const body = ctx.body({ activity_ids: [ctx.activity.id, autre.id], subject: 'Rappel : kimono' });
      const res = await ctx.send(body);
      expect(res.status).toBe(201);
      const m = res.body.mailing;
      expect(m).toMatchObject({ subject: 'Rappel : kimono', transport: 'stub', recipients_count: 3, failed_count: 0 });
      expect(['sent', 'partial', 'failed']).toContain(m.status);
      expect(m.status).toBe('sent');
      expect(m.sender).toMatchObject({ name: 'Marie Dupont' });
      expect(m.activities.map((a) => a.id).sort()).toEqual([ctx.activity.id, autre.id].sort());
      expect(Number.isNaN(Date.parse(m.created_at))).toBe(false);
      expect(Number.isNaN(Date.parse(m.completed_at))).toBe(false);
      const { rows } = await ctx.pool.query('SELECT status, email FROM mailing_recipients WHERE mailing_id = $1 ORDER BY email', [m.id]);
      expect(rows).toEqual([
        { status: 'stubbed', email: 'a@mail.fr' },
        { status: 'stubbed', email: 'b@mail.fr' },
        { status: 'stubbed', email: 'c@mail.fr' },
      ]);
    });

    it('une seule activite : seuls ses inscrits sont destinataires', async () => {
      const res = await ctx.send(ctx.body({ activity_ids: [autre.id] }));
      expect(res.status).toBe(201);
      expect(res.body.mailing.recipients_count).toBe(2);
    });

    it('activite fermee : ses inscrits restent destinataires', async () => {
      const fermee = await newActivity(ctx, { title: 'Fermee' });
      await addRegs(ctx.pool, fermee.id, ['f@mail.fr']);
      await ctx.api('post', `/api/activities/${fermee.id}/close`);
      const res = await ctx.send(ctx.body({ activity_ids: [fermee.id] }));
      expect(res.status).toBe(201);
      expect(res.body.mailing.recipients_count).toBe(1);
    });

    it('409 no_recipients si aucune inscription (aucun envoi cree)', async () => {
      const vide = await newActivity(ctx, { title: 'Sans inscrit' });
      expectConflict(await ctx.send(ctx.body({ activity_ids: [vide.id] })), 'no_recipients');
      const { rows } = await ctx.pool.query('SELECT count(*)::int AS n FROM mailing_activities WHERE activity_id = $1', [vide.id]);
      expect(rows[0].n).toBe(0);
    });

    it('404 not_found si une activite est inconnue', async () => {
      const res = await ctx.send(ctx.body({ activity_ids: [ctx.activity.id, '00000000-0000-4000-8000-000000000000'] }));
      expectError(res, 404, 'not_found');
    });

    it('le transport stub n\'envoie rien : aucun hote SMTP requis', async () => {
      expect(process.env.SMTP_HOST).toBeUndefined();
      expect((await ctx.send(ctx.body())).status).toBe(201);
    });
  });

  describe('anti double-envoi (E8)', () => {
    it('meme responsable, meme sujet/corps/activites : 409 sur le rejeu, aucun second envoi', async () => {
      const body = ctx.body({ subject: uniq('Rejeu') });
      expect((await ctx.send(body)).status).toBe(201);
      const rejeu = await ctx.send(body);
      expectConflict(rejeu, 'duplicate_mailing');
      const { rows } = await ctx.pool.query('SELECT count(*)::int AS n FROM mailings WHERE subject = $1', [body.subject]);
      expect(rows[0].n).toBe(1);
    });

    it('un sujet, un corps ou une selection differents ne sont pas consideres comme un rejeu', async () => {
      const base = ctx.body({ subject: uniq('Variante') });
      expect((await ctx.send(base)).status).toBe(201);
      expect((await ctx.send({ ...base, body: `${base.body} (suite)` })).status).toBe(201);
      expect((await ctx.send({ ...base, activity_ids: [autre.id] })).status).toBe(201);
    });
  });
});

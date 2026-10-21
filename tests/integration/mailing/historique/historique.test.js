// Integration : historique des envois (GET /api/mailings, GET /api/mailings/:id) et anonymisation apres desinscription.
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hasDb, closeApp, expectError, BASE_URL } from '../../_support/harness.js';
import { register, tokenOf, publicDelete } from '../../_support/inscription.js';
import { mailingSetup, uniq } from '../../_support/mailing.js';

const UUID_INCONNU = '00000000-0000-4000-8000-000000000000';

describe.skipIf(!hasDb)('Mailing - historique', () => {
  let ctx;
  let premier;
  let second;
  beforeAll(async () => {
    ctx = await mailingSetup({ emails: ['a@mail.fr', 'b@mail.fr'] });
    premier = (await ctx.send(ctx.body({ subject: uniq('Premier'), body: 'Corps du premier' }))).body.mailing;
    await new Promise((r) => setTimeout(r, 20));
    second = (await ctx.send(ctx.body({ subject: uniq('Second'), body: 'Corps du second' }))).body.mailing;
  });
  afterAll(() => closeApp(ctx));

  describe('GET /api/mailings', () => {
    it('liste triee created_at decroissant, sans le corps', async () => {
      const res = await ctx.api('get', '/api/mailings');
      expect(res.status).toBe(200);
      const ids = res.body.mailings.map((m) => m.id);
      expect(ids.indexOf(second.id)).toBeLessThan(ids.indexOf(premier.id));
      for (const m of res.body.mailings) {
        expect(m).not.toHaveProperty('body');
        expect(m).toMatchObject({ transport: 'stub', status: 'sent', recipients_count: 2 });
        expect(m.sender).toHaveProperty('name');
        expect(m.activities[0]).toMatchObject({ id: ctx.activity.id, title: 'Stage judo Toussaint' });
      }
    });

    it('aucune adresse dans la liste', async () => {
      const res = await ctx.api('get', '/api/mailings');
      expect(JSON.stringify(res.body)).not.toMatch(/@mail\.fr/);
    });
  });

  describe('GET /api/mailings/:id', () => {
    it('detail : envoi complet (avec corps) + destinataires avec statut', async () => {
      const res = await ctx.api('get', `/api/mailings/${premier.id}`);
      expect(res.status).toBe(200);
      expect(res.body.mailing).toMatchObject({ id: premier.id, subject: premier.subject, body: 'Corps du premier', status: 'sent' });
      expect(res.body.recipients).toHaveLength(2);
      for (const r of res.body.recipients) {
        expect(Object.keys(r).sort()).toEqual(['email', 'error', 'sent_at', 'status']);
        expect(r.status).toBe('stubbed');
      }
      expect(res.body.recipients.map((r) => r.email).sort()).toEqual(['a@mail.fr', 'b@mail.fr']);
    });

    it('ne contient aucun jeton (desabonnement ou gestion)', async () => {
      const res = await ctx.api('get', `/api/mailings/${premier.id}`);
      expect(JSON.stringify(res.body)).not.toMatch(/token|hash|unsubscribe|[A-Za-z0-9_-]{43}/i);
    });

    it('404 si inconnu', async () => {
      expectError(await ctx.api('get', `/api/mailings/${UUID_INCONNU}`), 404, 'not_found');
    });

    it('401 sans session', async () => {
      expectError(await request(ctx.app).get(`/api/mailings/${premier.id}`), 401, 'unauthenticated');
    });
  });

  describe('anonymisation apres desinscription (LOT-3)', () => {
    it('destinataire desinscrit : email null dans le detail, ligne et compteurs conserves', async () => {
      const res = await register(ctx, ctx.activity.public_slug, { contact_email: 'depart@mail.fr', participant_name: 'Depart' });
      expect(res.status).toBe(201);
      const m = (await ctx.send(ctx.body({ subject: uniq('Avant depart') }))).body.mailing;
      expect(m.recipients_count).toBe(3);
      expect((await publicDelete(ctx, `/api/public/registrations/${tokenOf(res)}`)).status).toBe(204);
      const detail = await ctx.api('get', `/api/mailings/${m.id}`);
      expect(detail.body.recipients).toHaveLength(3);
      expect(detail.body.recipients.filter((r) => r.email === null)).toHaveLength(1);
      expect(JSON.stringify(detail.body)).not.toContain('depart@mail.fr');
      expect(detail.body.mailing.recipients_count).toBe(3);
    });

    it('retrait par le responsable : meme anonymisation', async () => {
      const { id: regId } = (await register(ctx, ctx.activity.public_slug, { contact_email: 'retire@mail.fr', participant_name: 'Retire' })).body.registration;
      const m = (await ctx.send(ctx.body({ subject: uniq('Avant retrait') }))).body.mailing;
      const del = await request(ctx.app).delete(`/api/activities/${ctx.activity.id}/registrations/${regId}`).set('Cookie', ctx.cookie).set('Origin', BASE_URL);
      expect(del.status).toBe(204);
      const detail = await ctx.api('get', `/api/mailings/${m.id}`);
      expect(JSON.stringify(detail.body)).not.toContain('retire@mail.fr');
    });
  });
});

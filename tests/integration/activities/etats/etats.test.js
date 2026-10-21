// Integration : machine a etats d'une activite (docs/mockup/v0.1.0/conception/activite__etats_et_inscription.md)
//   draft -> open -> closed -> open (reouverture) ; transitions invalides -> 409 invalid_transition.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import {
  hasDb, makeApp, closeApp, resetData, createUser, login, expectError, expectConflict, validActivity, insertRegistrations, BASE_URL,
} from '../../_support/harness.js';

const UUID_INCONNU = '00000000-0000-4000-8000-000000000000';

describe.skipIf(!hasDb)('Activites - etats et inscrits', () => {
  let ctx;
  let cookie;
  const api = (method, url) => request(ctx.app)[method](url).set('Cookie', cookie).set('Origin', BASE_URL);
  const create = async (over = {}) => (await api('post', '/api/activities').send(validActivity(over))).body.activity;
  const statusOf = async (id) => (await api('get', `/api/activities/${id}`)).body.activity.status;

  beforeAll(async () => {
    ctx = await makeApp();
    await resetData(ctx.pool);
    await createUser(ctx.pool, { email: 'marie@club.fr', password: 'motdepasse-solide-1' });
    cookie = await login(ctx.app, 'marie@club.fr', 'motdepasse-solide-1');
  });
  beforeEach(() => ctx.pool.query('TRUNCATE activities CASCADE'));
  afterAll(() => closeApp(ctx));

  describe('401 sans session', () => {
    it.each([
      ['post', `/api/activities/${UUID_INCONNU}/open`],
      ['post', `/api/activities/${UUID_INCONNU}/close`],
      ['get', `/api/activities/${UUID_INCONNU}/registrations`],
    ])('%s %s', async (method, url) => {
      expectError(await request(ctx.app)[method](url), 401, 'unauthenticated');
    });
  });

  describe('transitions valides', () => {
    it('draft -> open', async () => {
      const a = await create();
      const res = await api('post', `/api/activities/${a.id}/open`);
      expect(res.status).toBe(200);
      expect(res.body.activity).toMatchObject({ id: a.id, status: 'open' });
    });

    it('open -> closed', async () => {
      const a = await create();
      await api('post', `/api/activities/${a.id}/open`);
      const res = await api('post', `/api/activities/${a.id}/close`);
      expect(res.status).toBe(200);
      expect(res.body.activity.status).toBe('closed');
    });

    it('closed -> open (reouverture), le slug public est conserve', async () => {
      const a = await create();
      await api('post', `/api/activities/${a.id}/open`);
      await api('post', `/api/activities/${a.id}/close`);
      const res = await api('post', `/api/activities/${a.id}/open`);
      expect(res.status).toBe(200);
      expect(res.body.activity.status).toBe('open');
      expect(res.body.activity.public_slug).toBe(a.public_slug);
    });
  });

  describe('transitions invalides -> 409 invalid_transition (statut inchange)', () => {
    it('open sur une activite deja ouverte', async () => {
      const a = await create();
      await api('post', `/api/activities/${a.id}/open`);
      expectConflict(await api('post', `/api/activities/${a.id}/open`), 'invalid_transition');
      expect(await statusOf(a.id)).toBe('open');
    });

    it('close sur un brouillon', async () => {
      const a = await create();
      expectConflict(await api('post', `/api/activities/${a.id}/close`), 'invalid_transition');
      expect(await statusOf(a.id)).toBe('draft');
    });

    it('close sur une activite deja fermee', async () => {
      const a = await create();
      await api('post', `/api/activities/${a.id}/open`);
      await api('post', `/api/activities/${a.id}/close`);
      expectConflict(await api('post', `/api/activities/${a.id}/close`), 'invalid_transition');
    });

    it.each(['open', 'close'])('%s : 404 si activite inconnue', async (action) => {
      expectError(await api('post', `/api/activities/${UUID_INCONNU}/${action}`), 404, 'not_found');
    });
  });

  describe('GET /api/activities/:id/registrations', () => {
    it('LOT-2 : liste vide avec capacite et places restantes', async () => {
      const a = await create({ capacity: 20 });
      const res = await api('get', `/api/activities/${a.id}/registrations`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ registrations: [], count: 0, capacity: 20, remaining_places: 20 });
    });

    it('capacite illimitee : capacity et remaining_places null', async () => {
      const a = await create({ capacity: null });
      const res = await api('get', `/api/activities/${a.id}/registrations`);
      expect(res.body).toEqual({ registrations: [], count: 0, capacity: null, remaining_places: null });
    });

    it('inscriptions actives : champs du contrat, tri created_at croissant, aucun secret', async () => {
      const a = await create({ capacity: 5 });
      await insertRegistrations(ctx.pool, a.id, 2);
      const res = await api('get', `/api/activities/${a.id}/registrations`);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ count: 2, capacity: 5, remaining_places: 3 });
      expect(res.body.registrations.map((r) => r.participant_name)).toEqual(['Participant 1', 'Participant 2']);
      for (const r of res.body.registrations) {
        expect(Object.keys(r).sort()).toEqual(['contact_email', 'contact_name', 'created_at', 'id', 'is_minor', 'participant_name']);
      }
      expect(JSON.stringify(res.body)).not.toMatch(/hash|token/i);
    });

    it("les compteurs de l'activite refletent les inscrits", async () => {
      const a = await create({ capacity: 4 });
      await insertRegistrations(ctx.pool, a.id, 3);
      const { activity } = (await api('get', `/api/activities/${a.id}`)).body;
      expect(activity).toMatchObject({ registrations_count: 3, remaining_places: 1 });
    });

    it('404 si activite inconnue', async () => {
      expectError(await api('get', `/api/activities/${UUID_INCONNU}/registrations`), 404, 'not_found');
    });
  });
});

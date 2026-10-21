// Integration : CRUD des activites (contracts/http-endpoints.md, section Activites ; contracts/models.md).
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import {
  hasDb, makeApp, closeApp, resetData, createUser, login, expectError, expectConflict, validActivity, insertRegistrations,
} from '../../_support/harness.js';

const UUID_INCONNU = '00000000-0000-4000-8000-000000000000';

describe.skipIf(!hasDb)('Activites - CRUD', () => {
  let ctx;
  let cookie;
  let ownerId;
  const api = (method, url) => request(ctx.app)[method](url).set('Cookie', cookie);
  const create = async (over = {}) => (await api('post', '/api/activities').send(validActivity(over))).body.activity;

  beforeAll(async () => {
    ctx = await makeApp();
    await resetData(ctx.pool);
    ownerId = await createUser(ctx.pool, { email: 'marie@club.fr', password: 'motdepasse-solide-1', name: 'Marie Dupont' });
    cookie = await login(ctx.app, 'marie@club.fr', 'motdepasse-solide-1');
  });
  beforeEach(() => ctx.pool.query('TRUNCATE activities CASCADE'));
  afterAll(() => closeApp(ctx));

  describe('401 sans session', () => {
    it.each([
      ['get', '/api/activities'],
      ['post', '/api/activities'],
      ['get', `/api/activities/${UUID_INCONNU}`],
      ['patch', `/api/activities/${UUID_INCONNU}`],
      ['delete', `/api/activities/${UUID_INCONNU}`],
    ])('%s %s', async (method, url) => {
      const res = await request(ctx.app)[method](url).send({});
      expectError(res, 401, 'unauthenticated');
    });
  });

  describe('POST /api/activities', () => {
    it('201 : brouillon, slug public, champs calcules, proprietaire', async () => {
      const res = await api('post', '/api/activities').send(validActivity());
      expect(res.status).toBe(201);
      const a = res.body.activity;
      expect(a).toMatchObject({
        title: 'Stage judo Toussaint', description: 'Apporter kimono et gourde.', location: 'Dojo municipal',
        capacity: 20, status: 'draft', registrations_count: 0, remaining_places: 20,
        owner: { id: ownerId, name: 'Marie Dupont' },
      });
      expect(a.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(a.public_slug).toMatch(/^[0-9A-Za-z]{12}$/);
      expect(a.public_url).toContain(`/a/${a.public_slug}`);
      expect(new Date(a.starts_at).toISOString()).toBe('2026-10-28T14:00:00.000Z');
      expect(Number.isNaN(Date.parse(a.created_at))).toBe(false);
      expect(Number.isNaN(Date.parse(a.updated_at))).toBe(false);
    });

    it('capacite absente ou null = illimitee (remaining_places null)', async () => {
      const sans = await create({ capacity: undefined });
      const nulle = await create({ capacity: null });
      for (const a of [sans, nulle]) {
        expect(a.capacity).toBeNull();
        expect(a.remaining_places).toBeNull();
      }
    });

    it('description facultative (null par defaut)', async () => {
      const a = await create({ description: undefined });
      expect(a.description).toBeNull();
    });

    it('deux activites ont des slugs distincts', async () => {
      const [a, b] = [await create(), await create()];
      expect(a.public_slug).not.toBe(b.public_slug);
    });

    it.each([
      ['titre vide', { title: '' }],
      ['titre manquant', { title: undefined }],
      ['titre > 120 caracteres', { title: 'x'.repeat(121) }],
      ['starts_at invalide', { starts_at: 'pas-une-date' }],
      ['starts_at manquant', { starts_at: undefined }],
      ['lieu manquant', { location: undefined }],
      ['capacite 0', { capacity: 0 }],
      ['capacite negative', { capacity: -3 }],
      ['capacite non numerique', { capacity: 'vingt' }],
    ])('400 validation_error : %s', async (_nom, over) => {
      const res = await api('post', '/api/activities').send(validActivity(over));
      expectError(res, 400, 'validation_error');
      expect(typeof res.body.message).toBe('string');
    });

    it('titre de 120 caracteres accepte', async () => {
      const res = await api('post', '/api/activities').send(validActivity({ title: 'x'.repeat(120) }));
      expect(res.status).toBe(201);
    });
  });

  describe('GET /api/activities', () => {
    it('liste toutes les activites du club (tous responsables), triees par starts_at decroissant', async () => {
      await create({ title: 'A', starts_at: '2026-11-01T10:00:00.000Z' });
      await create({ title: 'C', starts_at: '2026-12-01T10:00:00.000Z' });
      await create({ title: 'B', starts_at: '2026-11-15T10:00:00.000Z' });
      const res = await api('get', '/api/activities');
      expect(res.status).toBe(200);
      expect(res.body.activities.map((a) => a.title)).toEqual(['C', 'B', 'A']);
    });

    it('liste vide -> { activities: [] }', async () => {
      const res = await api('get', '/api/activities');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ activities: [] });
    });

    it('filtre ?status=', async () => {
      const brouillon = await create({ title: 'Brouillon' });
      const ouverte = await create({ title: 'Ouverte' });
      await api('post', `/api/activities/${ouverte.id}/open`);
      const open = await api('get', '/api/activities?status=open');
      expect(open.body.activities.map((a) => a.title)).toEqual(['Ouverte']);
      const draft = await api('get', '/api/activities?status=draft');
      expect(draft.body.activities.map((a) => a.id)).toEqual([brouillon.id]);
      const closed = await api('get', '/api/activities?status=closed');
      expect(closed.body.activities).toEqual([]);
    });
  });

  describe('GET /api/activities/:id', () => {
    it('200 avec les champs du contrat', async () => {
      const a = await create();
      const res = await api('get', `/api/activities/${a.id}`);
      expect(res.status).toBe(200);
      expect(res.body.activity).toEqual(a);
    });

    it('404 not_found si inconnue', async () => {
      expectError(await api('get', `/api/activities/${UUID_INCONNU}`), 404, 'not_found');
    });
  });

  describe('PATCH /api/activities/:id', () => {
    it('200 : modification partielle, autres champs inchanges, updated_at avance', async () => {
      const a = await create();
      await new Promise((r) => setTimeout(r, 15));
      const res = await api('patch', `/api/activities/${a.id}`).send({ title: 'Nouveau titre', capacity: 30 });
      expect(res.status).toBe(200);
      expect(res.body.activity).toMatchObject({ id: a.id, title: 'Nouveau titre', capacity: 30, remaining_places: 30, location: a.location });
      expect(res.body.activity.public_slug).toBe(a.public_slug);
      expect(Date.parse(res.body.activity.updated_at)).toBeGreaterThan(Date.parse(a.updated_at));
    });

    it('capacite -> null (illimitee)', async () => {
      const a = await create();
      const res = await api('patch', `/api/activities/${a.id}`).send({ capacity: null });
      expect(res.status).toBe(200);
      expect(res.body.activity.capacity).toBeNull();
    });

    it('ne modifie ni le statut ni le slug via PATCH', async () => {
      const a = await create();
      const res = await api('patch', `/api/activities/${a.id}`).send({ status: 'open', public_slug: 'pirate' });
      expect([200, 400]).toContain(res.status);
      const apres = (await api('get', `/api/activities/${a.id}`)).body.activity;
      expect(apres.status).toBe('draft');
      expect(apres.public_slug).toBe(a.public_slug);
    });

    it.each([
      ['titre vide', { title: '' }],
      ['titre > 120', { title: 'x'.repeat(121) }],
      ['starts_at invalide', { starts_at: 'nope' }],
      ['capacite 0', { capacity: 0 }],
    ])('400 validation_error : %s', async (_nom, body) => {
      const a = await create();
      expectError(await api('patch', `/api/activities/${a.id}`).send(body), 400, 'validation_error');
    });

    it('404 si inconnue', async () => {
      expectError(await api('patch', `/api/activities/${UUID_INCONNU}`).send({ title: 'x' }), 404, 'not_found');
    });

    it('409 capacity_below_registrations si capacite < inscrits actifs', async () => {
      const a = await create({ capacity: 5 });
      await insertRegistrations(ctx.pool, a.id, 3);
      expectConflict(await api('patch', `/api/activities/${a.id}`).send({ capacity: 2 }), 'capacity_below_registrations');
      const egal = await api('patch', `/api/activities/${a.id}`).send({ capacity: 3 });
      expect(egal.status).toBe(200);
      expect(egal.body.activity.remaining_places).toBe(0);
    });
  });

  describe('DELETE /api/activities/:id', () => {
    it('204 sur un brouillon, puis 404', async () => {
      const a = await create();
      expect((await api('delete', `/api/activities/${a.id}`)).status).toBe(204);
      expectError(await api('get', `/api/activities/${a.id}`), 404, 'not_found');
    });

    it('204 sur une activite ouverte sans inscription', async () => {
      const a = await create();
      await api('post', `/api/activities/${a.id}/open`);
      expect((await api('delete', `/api/activities/${a.id}`)).status).toBe(204);
    });

    it('409 has_registrations si ouverte avec inscriptions actives (activite conservee)', async () => {
      const a = await create();
      await api('post', `/api/activities/${a.id}/open`);
      await insertRegistrations(ctx.pool, a.id, 1);
      expectConflict(await api('delete', `/api/activities/${a.id}`), 'has_registrations');
      expect((await api('get', `/api/activities/${a.id}`)).status).toBe(200);
    });

    it('404 si inconnue', async () => {
      expectError(await api('delete', `/api/activities/${UUID_INCONNU}`), 404, 'not_found');
    });
  });
});

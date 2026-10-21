// Integration : gestion d'une inscription par token (GET / DELETE /api/public/registrations/:token),
// anonymisation RGPD et vue du responsable (GET /api/activities/:id/registrations).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { hasDb, closeApp, expectError, BASE_URL } from '../../_support/harness.js';
import { setup, newActivity, register, tokenOf, publicGet, publicDelete } from '../../_support/inscription.js';

describe.skipIf(!hasDb)('Inscription - gestion par token', () => {
  let ctx;
  let activity;
  beforeAll(async () => {
    ctx = await setup();
    activity = await newActivity(ctx, { capacity: 50 });
  });
  afterAll(() => closeApp(ctx));

  const nouvelle = async (over) => {
    const res = await register(ctx, activity.public_slug, over);
    expect(res.status).toBe(201);
    return { token: tokenOf(res), id: res.body.registration.id };
  };

  describe('GET /api/public/registrations/:token', () => {
    it('200 : resume de SON inscription et de l\'activite, sans donnees d\'autrui', async () => {
      const moi = await nouvelle({ contact_email: 'moi@mail.fr', participant_name: 'Moi Meme' });
      await nouvelle({ contact_email: 'autre@mail.fr', participant_name: 'Autre Enfant' });
      const res = await publicGet(ctx, `/api/public/registrations/${moi.token}`);
      expect(res.status).toBe(200);
      expect(res.body.registration).toMatchObject({ id: moi.id, participant_name: 'Moi Meme', contact_email: 'moi@mail.fr' });
      expect(res.body.activity).toMatchObject({ title: activity.title, location: activity.location, status: 'open' });
      expect(res.body.activity.public_url).toContain(`/a/${activity.public_slug}`);
      const txt = JSON.stringify(res.body);
      expect(txt).not.toContain('autre@mail.fr');
      expect(txt).not.toContain('Autre Enfant');
      expect(txt).not.toMatch(/hash/i);
    });

    it('token inconnu, altere ou mal forme : 404 identique (pas d\'enumeration)', async () => {
      const { token } = await nouvelle({ contact_email: 'alt@mail.fr', participant_name: 'Alt' });
      const altere = token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A');
      const reponses = [];
      for (const t of [altere, 'inconnu', 'x'.repeat(43), '%00', 'A'.repeat(500)]) {
        const res = await publicGet(ctx, `/api/public/registrations/${encodeURIComponent(t)}`);
        expectError(res, 404, 'not_found');
        reponses.push(res.body);
      }
      for (const b of reponses) expect(b).toEqual(reponses[0]);
    });

    it('Cache-Control no-store (le token est une preuve)', async () => {
      const { token } = await nouvelle({ contact_email: 'cc@mail.fr', participant_name: 'CC' });
      const res = await publicGet(ctx, `/api/public/registrations/${token}`);
      expect(res.headers['cache-control']).toMatch(/no-store/);
    });
  });

  describe('DELETE /api/public/registrations/:token', () => {
    it('204, puis GET 404, DELETE 404, ligne supprimee, place liberee', async () => {
      const a = await newActivity(ctx, { capacity: 1, title: 'Une place' });
      const r1 = await register(ctx, a.public_slug, { contact_email: 'un@mail.fr' });
      const token = tokenOf(r1);
      expect((await register(ctx, a.public_slug, { contact_email: 'deux@mail.fr' })).status).toBe(409);

      expect((await publicDelete(ctx, `/api/public/registrations/${token}`)).status).toBe(204);
      expectError(await publicGet(ctx, `/api/public/registrations/${token}`), 404, 'not_found');
      expectError(await publicDelete(ctx, `/api/public/registrations/${token}`), 404, 'not_found');
      const { rows } = await ctx.pool.query('SELECT 1 FROM registrations WHERE id = $1', [r1.body.registration.id]);
      expect(rows).toHaveLength(0);
      // la place est liberee
      expect((await register(ctx, a.public_slug, { contact_email: 'deux@mail.fr' })).status).toBe(201);
    });

    it('404 pour un token inconnu', async () => {
      expectError(await publicDelete(ctx, '/api/public/registrations/inconnu'), 404, 'not_found');
    });

    it("n'affecte pas les autres inscriptions", async () => {
      const a = await nouvelle({ contact_email: 'garde@mail.fr', participant_name: 'Garde' });
      const b = await nouvelle({ contact_email: 'supprime@mail.fr', participant_name: 'Supprime' });
      await publicDelete(ctx, `/api/public/registrations/${b.token}`);
      expect((await publicGet(ctx, `/api/public/registrations/${a.token}`)).status).toBe(200);
    });

    it('anonymise mailing_recipients : registration_id et email a NULL, ligne conservee', async () => {
      const { token, id } = await nouvelle({ contact_email: 'anon@mail.fr', participant_name: 'Anon' });
      const { rows: [{ id: userId }] } = await ctx.pool.query('SELECT id FROM users LIMIT 1');
      const { rows: [m] } = await ctx.pool.query(
        `INSERT INTO mailings (subject, body, sender_id, status, recipients_count, sent_count, failed_count, transport, created_at, completed_at)
         VALUES ('Sujet', 'Corps', $1, 'sent', 1, 1, 0, 'stub', now(), now()) RETURNING id`,
        [userId],
      );
      await ctx.pool.query(
        `INSERT INTO mailing_recipients (mailing_id, registration_id, email, status, sent_at) VALUES ($1, $2, 'anon@mail.fr', 'stubbed', now())`,
        [m.id, id],
      );
      expect((await publicDelete(ctx, `/api/public/registrations/${token}`)).status).toBe(204);
      const { rows } = await ctx.pool.query('SELECT registration_id, email FROM mailing_recipients WHERE mailing_id = $1', [m.id]);
      expect(rows).toEqual([{ registration_id: null, email: null }]);
    });
  });

  describe('GET /api/activities/:id/registrations (responsable)', () => {
    it('401 sans session', async () => {
      const res = await request(ctx.app).get(`/api/activities/${activity.id}/registrations`);
      expectError(res, 401, 'unauthenticated');
    });

    it('liste avec indicateur mineur, parent en contact, sans token ni hash', async () => {
      const a = await newActivity(ctx, { capacity: 10, title: 'Vue responsable' });
      await register(ctx, a.public_slug, { contact_email: 'parent@mail.fr' });
      await register(ctx, a.public_slug, { participant_name: 'Adulte', is_minor: false, contact_email: 'adulte@mail.fr' });
      const res = await ctx.api('get', `/api/activities/${a.id}/registrations`);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ count: 2, capacity: 10, remaining_places: 8 });
      const [mineur, majeur] = res.body.registrations;
      expect(mineur).toMatchObject({ participant_name: 'Leo Martin', is_minor: true, contact_name: 'Sophie Martin', contact_email: 'parent@mail.fr' });
      expect(majeur).toMatchObject({ is_minor: false, contact_name: 'Adulte' });
      expect(JSON.stringify(res.body)).not.toMatch(/token|hash/i);
      expect(JSON.stringify(res.body)).not.toContain(`${BASE_URL}/r/`);
    });

    it('une desinscription retire la personne de la liste', async () => {
      const a = await newActivity(ctx, { capacity: 10, title: 'Desinscription' });
      const r = await register(ctx, a.public_slug);
      await publicDelete(ctx, `/api/public/registrations/${tokenOf(r)}`);
      const res = await ctx.api('get', `/api/activities/${a.id}/registrations`);
      expect(res.body).toMatchObject({ registrations: [], count: 0, remaining_places: 10 });
    });
  });
});

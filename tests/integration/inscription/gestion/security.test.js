// Integration (scope security) : donnees personnelles — Origin, secrets absents des reponses et des logs,
// acces du responsable aux inscrits journalise sans donnees personnelles (decision utilisateur).
import { Writable } from 'node:stream';
import pino from 'pino';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hasDb, closeApp, expectError } from '../../_support/harness.js';
import { setup, newActivity, register, registrationBody, tokenOf, publicGet, publicDelete } from '../../_support/inscription.js';

const EMAIL_PARENT = 'parent.secret@mail.fr';
const NOM_ENFANT = 'Enfant Confidentiel';
const NOM_PARENT = 'Parent Confidentiel';

describe.skipIf(!hasDb)('Inscription - securite et donnees personnelles', () => {
  let ctx;
  let userId;
  let activity;
  const lines = [];
  beforeAll(async () => {
    const stream = new Writable({ write(chunk, _enc, cb) { lines.push(chunk.toString()); cb(); } });
    ctx = await setup({ logger: pino({ level: 'info' }, stream) });
    userId = (await ctx.api('get', '/api/auth/me')).body.user.id;
    activity = await newActivity(ctx, { capacity: 10 });
  });
  afterAll(() => closeApp(ctx));

  const logs = () => lines.join('');

  describe('Origin sur les routes publiques', () => {
    it('POST inscription avec Origin etranger -> 403 forbidden, rien cree', async () => {
      const res = await request(ctx.app)
        .post(`/api/public/activities/${activity.public_slug}/registrations`).set('Origin', 'https://evil.example').send(registrationBody());
      expectError(res, 403, 'forbidden');
      const { rows } = await ctx.pool.query('SELECT count(*)::int AS n FROM registrations');
      expect(rows[0].n).toBe(0);
    });

    it('POST avec Sec-Fetch-Site cross-site -> 403', async () => {
      const res = await request(ctx.app)
        .post(`/api/public/activities/${activity.public_slug}/registrations`).set('Sec-Fetch-Site', 'cross-site').send(registrationBody());
      expectError(res, 403, 'forbidden');
    });

    it('DELETE avec Origin etranger -> 403 ; la inscription subsiste', async () => {
      const r = await register(ctx, activity.public_slug, { contact_email: 'o@mail.fr', participant_name: 'Origin' });
      const res = await request(ctx.app).delete(`/api/public/registrations/${tokenOf(r)}`).set('Origin', 'https://evil.example');
      expectError(res, 403, 'forbidden');
      expect((await publicGet(ctx, `/api/public/registrations/${tokenOf(r)}`)).status).toBe(200);
    });
  });

  describe('secrets', () => {
    it('le token en clair n\'apparait que dans la reponse de creation (jamais dans la liste responsable ni la base)', async () => {
      const r = await register(ctx, activity.public_slug, { contact_email: 'tok@mail.fr', participant_name: 'Tok' });
      const token = tokenOf(r);
      const liste = await ctx.api('get', `/api/activities/${activity.id}/registrations`);
      expect(JSON.stringify(liste.body)).not.toContain(token);
      const fiche = await publicGet(ctx, `/api/public/activities/${activity.public_slug}`);
      expect(JSON.stringify(fiche.body)).not.toContain(token);
      const { rows } = await ctx.pool.query('SELECT * FROM registrations');
      expect(JSON.stringify(rows)).not.toContain(token);
    });

    it('la liste des inscrits exige une session valide (pas d\'acces par token ni anonyme)', async () => {
      const r = await register(ctx, activity.public_slug, { contact_email: 'anon2@mail.fr', participant_name: 'Anon2' });
      const res = await request(ctx.app).get(`/api/activities/${activity.id}/registrations`).set('Authorization', `Bearer ${tokenOf(r)}`);
      expectError(res, 401, 'unauthenticated');
    });
  });

  describe('journaux', () => {
    it('aucune donnee personnelle ni token dans les logs (inscription, consultation, desinscription, erreurs)', async () => {
      const r = await register(ctx, activity.public_slug, { contact_email: EMAIL_PARENT, participant_name: NOM_ENFANT, contact_name: NOM_PARENT });
      const token = tokenOf(r);
      await publicGet(ctx, `/api/public/registrations/${token}`);
      await ctx.api('get', `/api/activities/${activity.id}/registrations`);
      await register(ctx, activity.public_slug, { contact_email: EMAIL_PARENT, participant_name: NOM_ENFANT, contact_name: NOM_PARENT }); // 409
      await register(ctx, activity.public_slug, { contact_email: 'invalide', participant_name: NOM_ENFANT }); // 400
      await publicDelete(ctx, `/api/public/registrations/${token}`);
      const out = logs();
      expect(out.length).toBeGreaterThan(0);
      for (const secret of [EMAIL_PARENT, NOM_ENFANT, NOM_PARENT, token]) {
        expect(out, `log contenant "${secret.slice(0, 12)}..."`).not.toContain(secret);
      }
    });

    it('la consultation des inscrits par un responsable est journalisee (userId + activityId) sans donnees personnelles', async () => {
      await register(ctx, activity.public_slug, { contact_email: 'vu@mail.fr', participant_name: 'Personne Vue' });
      lines.length = 0;
      const res = await ctx.api('get', `/api/activities/${activity.id}/registrations`);
      expect(res.status).toBe(200);
      const ligne = lines.map((l) => { try { return JSON.parse(l); } catch { return null; } })
        .filter(Boolean)
        .find((o) => JSON.stringify(o).includes(userId) && JSON.stringify(o).includes(activity.id));
      expect(ligne, 'evenement de journal reliant userId et activityId').toBeDefined();
      const out = logs();
      expect(out).not.toContain('vu@mail.fr');
      expect(out).not.toContain('Personne Vue');
    });
  });
});

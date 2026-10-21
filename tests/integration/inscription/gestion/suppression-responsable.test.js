// Integration : DELETE /api/activities/:id/registrations/:registrationId (responsable) + trigger d'anonymisation (defense en profondeur).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { hasDb, closeApp, expectError, BASE_URL } from '../../_support/harness.js';
import { setup, newActivity, register, tokenOf, publicGet } from '../../_support/inscription.js';

const UNKNOWN = '00000000-0000-4000-8000-000000000000';

describe.skipIf(!hasDb)('Inscription - suppression par un responsable', () => {
  let ctx;
  let a1;
  let a2;
  const reg = async (activity, over) => (await register(ctx, activity.public_slug, over)).body;
  beforeAll(async () => {
    ctx = await setup();
    a1 = await newActivity(ctx, { capacity: 10 });
    a2 = await newActivity(ctx, { capacity: 10, title: 'Autre' });
  });
  afterAll(() => closeApp(ctx));

  it('204 : inscription supprimee, token inutilisable, places liberees, historique anonymise, evenement sans donnees personnelles', async () => {
    const created = await reg(a1, { participant_name: 'Leo Martin', contact_email: 'sophie@mail.fr' });
    const id = created.registration.id;
    const { rows: [m] } = await ctx.pool.query(
      `INSERT INTO mailings (subject, body, sender_id, status, recipients_count, transport) VALUES ('S','C',(SELECT id FROM users LIMIT 1),'sent',1,'smtp') RETURNING id`,
    );
    await ctx.pool.query(`INSERT INTO mailing_recipients (mailing_id, registration_id, email, status, error) VALUES ($1,$2,'sophie@mail.fr','failed','550 sophie@mail.fr unknown')`, [m.id, id]);

    const res = await ctx.api('delete', `/api/activities/${a1.id}/registrations/${id}`);
    expect(res.status).toBe(204);
    expect((await publicGet(ctx, `/api/public/registrations/${tokenOf({ body: created })}`)).status).toBe(404);
    expect((await ctx.pool.query('SELECT count(*)::int AS n FROM registrations WHERE id = $1', [id])).rows[0].n).toBe(0);
    const { rows: [rcpt] } = await ctx.pool.query('SELECT registration_id, email, error FROM mailing_recipients WHERE mailing_id = $1', [m.id]);
    expect(rcpt).toEqual({ registration_id: null, email: null, error: null });
  });

  it('double suppression -> 404 ; mauvaise activite -> 404 (inscription conservee) ; ids malformes/inconnus -> 404', async () => {
    const created = await reg(a1, { participant_name: 'Emma Durand', contact_email: 'emma@mail.fr' });
    const id = created.registration.id;
    expectError(await ctx.api('delete', `/api/activities/${a2.id}/registrations/${id}`), 404, 'not_found');
    expect((await publicGet(ctx, `/api/public/registrations/${tokenOf({ body: created })}`)).status).toBe(200);
    expect((await ctx.api('delete', `/api/activities/${a1.id}/registrations/${id}`)).status).toBe(204);
    expectError(await ctx.api('delete', `/api/activities/${a1.id}/registrations/${id}`), 404, 'not_found');
    for (const [aid, rid] of [[UNKNOWN, id], [a1.id, UNKNOWN], [a1.id, 'abc'], ['abc', id], [a1.id, "1' OR '1'='1"]]) {
      expectError(await ctx.api('delete', `/api/activities/${aid}/registrations/${encodeURIComponent(rid)}`), 404, 'not_found');
    }
  });

  it('sans session -> 401 ; Origin etranger ou absent avec cookie -> 403', async () => {
    const created = await reg(a1, { participant_name: 'Noa Petit', contact_email: 'noa@mail.fr' });
    const url = `/api/activities/${a1.id}/registrations/${created.registration.id}`;
    expectError(await request(ctx.app).delete(url).set('Origin', BASE_URL), 401, 'unauthenticated');
    expectError(await request(ctx.app).delete(url).set('Cookie', ctx.cookie).set('Origin', 'https://evil.example'), 403, 'forbidden');
    expectError(await request(ctx.app).delete(url).set('Cookie', ctx.cookie), 403, 'forbidden');
    expect((await ctx.pool.query('SELECT count(*)::int AS n FROM registrations WHERE id = $1', [created.registration.id])).rows[0].n).toBe(1);
  });

  it('trigger : un DELETE direct en base efface aussi email/error des destinataires lies', async () => {
    const created = await reg(a1, { participant_name: 'Zoe Blanc', contact_email: 'zoe@mail.fr' });
    const { rows: [m] } = await ctx.pool.query(
      `INSERT INTO mailings (subject, body, sender_id, status, recipients_count, transport) VALUES ('S','C',(SELECT id FROM users LIMIT 1),'sent',1,'smtp') RETURNING id`,
    );
    await ctx.pool.query(`INSERT INTO mailing_recipients (mailing_id, registration_id, email, status, error) VALUES ($1,$2,'zoe@mail.fr','failed','boom zoe@mail.fr')`, [m.id, created.registration.id]);
    await ctx.pool.query('DELETE FROM registrations WHERE id = $1', [created.registration.id]);
    const { rows: [r] } = await ctx.pool.query('SELECT registration_id, email, error FROM mailing_recipients WHERE mailing_id = $1', [m.id]);
    expect(r).toEqual({ registration_id: null, email: null, error: null });
  });
});

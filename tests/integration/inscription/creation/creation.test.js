// Integration : POST /api/public/activities/:slug/registrations — cas nominaux (contracts/http-endpoints.md, #6).
// Rappel : POST public limite a 20/min/IP -> peu de requetes par fichier (app neuve par fichier).
import crypto from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hasDb, closeApp, BASE_URL } from '../../_support/harness.js';
import { setup, newActivity, register } from '../../_support/inscription.js';

describe.skipIf(!hasDb)('Inscription - creation nominale', () => {
  let ctx;
  let activity;
  beforeAll(async () => {
    ctx = await setup();
    activity = await newActivity(ctx, { capacity: null });
  });
  afterAll(() => closeApp(ctx));

  it('mineur via le parent : 201, contact = parent, manage_url a usage unique, token jamais stocke en clair', async () => {
    const res = await register(ctx, activity.public_slug);
    expect(res.status).toBe(201);
    const r = res.body.registration;
    expect(r).toMatchObject({ participant_name: 'Leo Martin', is_minor: true, contact_name: 'Sophie Martin', contact_email: 'sophie.martin@mail.fr' });
    expect(Object.keys(r).sort()).toEqual(['contact_email', 'contact_name', 'created_at', 'id', 'is_minor', 'participant_name']);
    expect(res.body.manage_url.startsWith(`${BASE_URL}/r/`)).toBe(true);
    const token = res.body.manage_url.split('/r/')[1];
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 octets base64url

    const { rows } = await ctx.pool.query('SELECT * FROM registrations WHERE id = $1', [r.id]);
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows[0])).not.toContain(token);
    expect(rows[0].manage_token_hash).toBeTruthy();
    expect(rows[0].manage_token_hash).not.toBe(token);
    expect(rows[0].consent_version).toBe('2026-10');
    expect(rows[0].consent_at).toBeTruthy();
    expect(rows[0].activity_id).toBe(activity.id);
    // hash SHA-256 du token (hex ou base64url)
    const sha = crypto.createHash('sha256').update(token).digest();
    expect([sha.toString('hex'), sha.toString('base64url'), sha.toString('base64')]).toContain(rows[0].manage_token_hash);
  });

  it('majeur : contact_name ignore et copie depuis participant_name', async () => {
    const res = await register(ctx, activity.public_slug, {
      participant_name: 'Paul Durand', is_minor: false, contact_name: 'Quelqu un d autre', contact_email: 'paul@mail.fr',
    });
    expect(res.status).toBe(201);
    expect(res.body.registration).toMatchObject({ is_minor: false, contact_name: 'Paul Durand', contact_email: 'paul@mail.fr' });
  });

  it('majeur sans contact_name : accepte', async () => {
    const res = await register(ctx, activity.public_slug, {
      participant_name: 'Anne Roux', is_minor: false, contact_name: undefined, contact_email: 'anne@mail.fr',
    });
    expect(res.status).toBe(201);
    expect(res.body.registration.contact_name).toBe('Anne Roux');
  });

  it('e-mail stocke en minuscules', async () => {
    const res = await register(ctx, activity.public_slug, { participant_name: 'Zoe', contact_email: 'ZOE.Parent@Mail.FR' });
    expect(res.status).toBe(201);
    expect(res.body.registration.contact_email).toBe('zoe.parent@mail.fr');
  });

  it("l'inscription decremente les places restantes", async () => {
    const limitee = await newActivity(ctx, { capacity: 3, title: 'Limitee' });
    await register(ctx, limitee.public_slug, { contact_email: 'a@mail.fr' });
    const { activity: a } = (await ctx.api('get', `/api/activities/${limitee.id}`)).body;
    expect(a).toMatchObject({ registrations_count: 1, remaining_places: 2 });
  });
});

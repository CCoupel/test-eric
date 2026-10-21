// Integration : validation stricte de POST /api/public/activities/:slug/registrations (400 / 404).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hasDb, closeApp, expectError } from '../../_support/harness.js';
import { setup, newActivity, register } from '../../_support/inscription.js';

describe.skipIf(!hasDb)('Inscription - validation', () => {
  let ctx;
  let activity;
  beforeAll(async () => {
    ctx = await setup();
    activity = await newActivity(ctx, { capacity: null });
  });
  afterAll(() => closeApp(ctx));

  it.each([
    ['consent false', { consent: false }],
    ['consent absent', { consent: undefined }],
    ['consent en chaine "true"', { consent: 'true' }],
    ['mineur sans contact_name', { is_minor: true, contact_name: undefined }],
    ['mineur contact_name vide', { is_minor: true, contact_name: '' }],
    ['participant_name vide', { participant_name: '' }],
    ['participant_name > 120', { participant_name: 'x'.repeat(121) }],
    ['e-mail invalide', { contact_email: 'pas-un-email' }],
    ['e-mail absent', { contact_email: undefined }],
    ['is_minor non booleen', { is_minor: 'oui' }],
    ['champ inconnu (strict)', { role: 'admin' }],
    ['champ inconnu manage_token', { manage_token: 'abc' }],
  ])('400 validation_error : %s', async (_nom, over) => {
    const res = await register(ctx, activity.public_slug, { contact_email: `v${Math.random().toString(36).slice(2)}@mail.fr`, ...over });
    expectError(res, 400, 'validation_error');
    expect(JSON.stringify(res.body)).not.toMatch(/stack|SELECT|INSERT/i);
  });

  it('aucune inscription creee apres un refus', async () => {
    const { rows } = await ctx.pool.query('SELECT count(*)::int AS n FROM registrations WHERE activity_id = $1', [activity.id]);
    expect(rows[0].n).toBe(0);
  });

  it('brouillon : 404 not_found (aucune inscription possible)', async () => {
    const brouillon = await newActivity(ctx, { open: false });
    expectError(await register(ctx, brouillon.public_slug), 404, 'not_found');
  });

  it('slug inconnu : 404 not_found', async () => {
    expectError(await register(ctx, 'inconnuinconn'), 404, 'not_found');
  });
});

// Integration : honeypot du formulaire public (champ `website`) — succes simule pour le robot, rien d'enregistre.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hasDb, closeApp } from '../../_support/harness.js';
import { setup, newActivity, register, tokenOf, publicGet } from '../../_support/inscription.js';

describe.skipIf(!hasDb)('Inscription - honeypot', () => {
  let ctx;
  let activity;
  beforeAll(async () => {
    ctx = await setup();
    activity = await newActivity(ctx, { capacity: 5 });
  });
  afterAll(() => closeApp(ctx));

  it('champ website rempli : 201 factice, aucune ligne, token inutilisable, place non consommee', async () => {
    const res = await register(ctx, activity.public_slug, { website: 'http://spam.example' });
    expect(res.status).toBe(201);
    const { rows } = await ctx.pool.query('SELECT count(*)::int AS n FROM registrations');
    expect(rows[0].n).toBe(0);
    expect((await publicGet(ctx, `/api/public/registrations/${tokenOf(res)}`)).status).toBe(404);
    expect((await publicGet(ctx, `/api/public/activities/${activity.public_slug}`)).body.activity.remaining_places).toBe(5);
  });

  it('champ website vide : inscription normale', async () => {
    expect((await register(ctx, activity.public_slug, { website: '' })).status).toBe(201);
  });
});

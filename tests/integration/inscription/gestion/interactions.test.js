// Integration : interactions LOT-2 x LOT-3 (modification / suppression d'une activite ayant des inscrits).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hasDb, closeApp, expectConflict } from '../../_support/harness.js';
import { setup, newActivity, register, tokenOf, publicGet, publicDelete } from '../../_support/inscription.js';

describe.skipIf(!hasDb)('Inscription - interactions avec les activites', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await setup();
  });
  afterAll(() => closeApp(ctx));

  it('PATCH capacite < inscrits : 409 capacity_below_registrations ; = inscrits : 200', async () => {
    const a = await newActivity(ctx, { capacity: 5 });
    for (const e of ['a', 'b', 'c']) await register(ctx, a.public_slug, { contact_email: `${e}@mail.fr`, participant_name: `E${e}` });
    expectConflict(await ctx.api('patch', `/api/activities/${a.id}`).send({ capacity: 2 }), 'capacity_below_registrations');
    const ok = await ctx.api('patch', `/api/activities/${a.id}`).send({ capacity: 3 });
    expect(ok.status).toBe(200);
    expect(ok.body.activity.remaining_places).toBe(0);
  });

  it('augmenter la capacite d\'une activite complete rouvre les inscriptions', async () => {
    const a = await newActivity(ctx, { capacity: 1 });
    await register(ctx, a.public_slug, { contact_email: 'a@mail.fr' });
    expectConflict(await register(ctx, a.public_slug, { contact_email: 'b@mail.fr' }), 'activity_full');
    await ctx.api('patch', `/api/activities/${a.id}`).send({ capacity: 2 });
    expect((await register(ctx, a.public_slug, { contact_email: 'b@mail.fr' })).status).toBe(201);
  });

  it('DELETE activite ouverte avec inscrits : 409 has_registrations, donnees conservees', async () => {
    const a = await newActivity(ctx, { capacity: 5 });
    const r = await register(ctx, a.public_slug);
    expectConflict(await ctx.api('delete', `/api/activities/${a.id}`), 'has_registrations');
    expect((await publicGet(ctx, `/api/public/registrations/${tokenOf(r)}`)).status).toBe(200);
  });

  it('DELETE activite fermee avec inscrits : 409 has_registrations', async () => {
    const a = await newActivity(ctx, { capacity: 5 });
    await register(ctx, a.public_slug);
    await ctx.api('post', `/api/activities/${a.id}/close`);
    expectConflict(await ctx.api('delete', `/api/activities/${a.id}`), 'has_registrations');
  });

  it('apres desinscription de tous, la suppression de l\'activite redevient possible', async () => {
    const a = await newActivity(ctx, { capacity: 5 });
    const r = await register(ctx, a.public_slug);
    await publicDelete(ctx, `/api/public/registrations/${tokenOf(r)}`);
    expect((await ctx.api('delete', `/api/activities/${a.id}`)).status).toBe(204);
  });

  it('fermeture : les inscrits existants gardent l\'acces a leur lien de gestion', async () => {
    const a = await newActivity(ctx, { capacity: 5 });
    const r = await register(ctx, a.public_slug);
    await ctx.api('post', `/api/activities/${a.id}/close`);
    const res = await publicGet(ctx, `/api/public/registrations/${tokenOf(r)}`);
    expect(res.status).toBe(200);
    expect(res.body.activity.status).toBe('closed');
  });
});

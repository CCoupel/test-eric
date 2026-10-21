// Integration : refus 409 a la creation (activity_closed, activity_full, already_registered) et ordre d'evaluation :
// 404 -> 400 -> 409 activity_closed -> 409 already_registered -> 409 activity_full (activite__etats_et_inscription.md).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hasDb, closeApp, expectError, expectConflict } from '../../_support/harness.js';
import { setup, newActivity, register } from '../../_support/inscription.js';

describe.skipIf(!hasDb)('Inscription - conflits', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await setup();
  });
  afterAll(() => closeApp(ctx));

  it('activite fermee : 409 activity_closed', async () => {
    const a = await newActivity(ctx);
    await ctx.api('post', `/api/activities/${a.id}/close`);
    expectConflict(await register(ctx, a.public_slug), 'activity_closed');
  });

  it('activite fermee puis rouverte : inscription de nouveau possible', async () => {
    const a = await newActivity(ctx);
    await ctx.api('post', `/api/activities/${a.id}/close`);
    await ctx.api('post', `/api/activities/${a.id}/open`);
    expect((await register(ctx, a.public_slug)).status).toBe(201);
  });

  it('doublon (meme e-mail + meme participant) : 409 already_registered', async () => {
    const a = await newActivity(ctx);
    expect((await register(ctx, a.public_slug)).status).toBe(201);
    expectConflict(await register(ctx, a.public_slug), 'already_registered');
  });

  it('doublon insensible a la casse (participant et e-mail)', async () => {
    const a = await newActivity(ctx);
    await register(ctx, a.public_slug);
    expectConflict(await register(ctx, a.public_slug, { participant_name: 'LEO MARTIN', contact_email: 'SOPHIE.MARTIN@MAIL.FR' }), 'already_registered');
  });

  it('un parent peut inscrire plusieurs enfants (meme e-mail, participants differents)', async () => {
    const a = await newActivity(ctx);
    expect((await register(ctx, a.public_slug)).status).toBe(201);
    expect((await register(ctx, a.public_slug, { participant_name: 'Lea Martin' })).status).toBe(201);
  });

  it('meme participant dans deux activites differentes : autorise', async () => {
    const [a, b] = [await newActivity(ctx), await newActivity(ctx)];
    expect((await register(ctx, a.public_slug)).status).toBe(201);
    expect((await register(ctx, b.public_slug)).status).toBe(201);
  });

  it('activite complete : 409 activity_full, aucune inscription en plus', async () => {
    const a = await newActivity(ctx, { capacity: 1 });
    expect((await register(ctx, a.public_slug, { contact_email: 'un@mail.fr' })).status).toBe(201);
    expectConflict(await register(ctx, a.public_slug, { contact_email: 'deux@mail.fr' }), 'activity_full');
    const { rows } = await ctx.pool.query('SELECT count(*)::int AS n FROM registrations WHERE activity_id = $1', [a.id]);
    expect(rows[0].n).toBe(1);
  });

  it('complete ET doublon : already_registered prime sur activity_full', async () => {
    const a = await newActivity(ctx, { capacity: 1 });
    await register(ctx, a.public_slug);
    expectConflict(await register(ctx, a.public_slug), 'already_registered');
  });

  it('fermee ET invalide : 400 prime sur 409', async () => {
    const a = await newActivity(ctx);
    await ctx.api('post', `/api/activities/${a.id}/close`);
    expectError(await register(ctx, a.public_slug, { consent: false }), 400, 'validation_error');
  });

  it('fermee ET complete : activity_closed prime', async () => {
    const a = await newActivity(ctx, { capacity: 1 });
    await register(ctx, a.public_slug, { contact_email: 'un@mail.fr' });
    await ctx.api('post', `/api/activities/${a.id}/close`);
    expectConflict(await register(ctx, a.public_slug, { contact_email: 'deux@mail.fr' }), 'activity_closed');
  });
});

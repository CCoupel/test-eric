// Integration : limite anti-remplissage par IP + activite sur POST /api/public/activities/:slug/registrations (securite P7).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hasDb, closeApp, expectError } from '../../_support/harness.js';
import { setup, newActivity, register } from '../../_support/inscription.js';

describe.skipIf(!hasDb)('Inscription - limite par IP + activite', () => {
  let ctx;
  let a1;
  let a2;
  beforeAll(async () => {
    ctx = await setup({ env: { RATE_LIMIT_REGISTRATION_PER_ACTIVITY_10MIN: '3' } });
    a1 = await newActivity(ctx, { capacity: 50 });
    a2 = await newActivity(ctx, { capacity: 50, title: 'Autre activite' });
  });
  afterAll(() => closeApp(ctx));

  it('apres 3 tentatives sur une activite, la 4e est refusee en 429 ; une autre activite n’est pas affectee', async () => {
    for (let i = 1; i <= 3; i++) {
      expect((await register(ctx, a1.public_slug, { participant_name: `Enfant ${i}` })).status, `essai ${i}`).toBe(201);
    }
    expectError(await register(ctx, a1.public_slug, { participant_name: 'Enfant 4' }), 429, 'rate_limited');
    expect((await register(ctx, a2.public_slug, { participant_name: 'Enfant A' })).status).toBe(201);
  });
});

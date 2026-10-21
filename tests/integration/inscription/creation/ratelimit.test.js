// Integration : rate limiting des inscriptions publiques (contrat : 20/min/IP -> 429 rate_limited).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hasDb, closeApp, expectError } from '../../_support/harness.js';
import { setup, newActivity, register } from '../../_support/inscription.js';

describe.skipIf(!hasDb)('Inscription - rate limiting', () => {
  let ctx;
  let activity;
  beforeAll(async () => {
    ctx = await setup();
    activity = await newActivity(ctx, { capacity: null });
  });
  afterAll(() => closeApp(ctx));

  it('20 requetes traitees, la 21e est refusee en 429 rate_limited', async () => {
    for (let i = 1; i <= 20; i++) {
      const res = await register(ctx, activity.public_slug, { contact_email: `rl${i}@mail.fr`, participant_name: `Enfant ${i}` });
      expect(res.status, `requete ${i}`).toBe(201);
    }
    expectError(await register(ctx, activity.public_slug, { contact_email: 'rl21@mail.fr' }), 429, 'rate_limited');
  });
});

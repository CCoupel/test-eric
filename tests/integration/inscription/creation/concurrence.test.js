// Integration : concurrence sur la derniere place (transaction SELECT ... FOR UPDATE, risque R6 du plan).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hasDb, closeApp, expectConflict } from '../../_support/harness.js';
import { setup, newActivity, register } from '../../_support/inscription.js';

describe.skipIf(!hasDb)('Inscription - concurrence', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await setup();
  });
  afterAll(() => closeApp(ctx));

  const count = async (id) =>
    (await ctx.pool.query('SELECT count(*)::int AS n FROM registrations WHERE activity_id = $1', [id])).rows[0].n;

  it('2 inscriptions simultanees pour la derniere place : exactement un 201, l\'autre 409 activity_full', async () => {
    const a = await newActivity(ctx, { capacity: 1 });
    const [r1, r2] = await Promise.all([
      register(ctx, a.public_slug, { contact_email: 'un@mail.fr' }),
      register(ctx, a.public_slug, { contact_email: 'deux@mail.fr' }),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([201, 409]);
    expectConflict(r1.status === 409 ? r1 : r2, 'activity_full');
    expect(await count(a.id)).toBe(1);
  });

  it('10 inscriptions simultanees pour 3 places : exactement 3 x 201, 7 x 409, 3 lignes en base', async () => {
    const a = await newActivity(ctx, { capacity: 3 });
    const res = await Promise.all(
      Array.from({ length: 10 }, (_, i) => register(ctx, a.public_slug, { contact_email: `p${i}@mail.fr`, participant_name: `Enfant ${i}` })),
    );
    expect(res.filter((r) => r.status === 201)).toHaveLength(3);
    expect(res.filter((r) => r.status === 409)).toHaveLength(7);
    expect(res.filter((r) => ![201, 409].includes(r.status))).toHaveLength(0);
    expect(await count(a.id)).toBe(3);
  });
});

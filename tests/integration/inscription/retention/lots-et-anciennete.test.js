// Integration : purge par lots (>500) et refus d'inscription sur une activite plus ancienne que la duree de conservation.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hasDb, closeApp, expectConflict } from '../../_support/harness.js';
import { setup, newActivity, register } from '../../_support/inscription.js';

describe.skipIf(!hasDb)('Retention - lots et anciennete', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await setup();
  });
  afterAll(() => closeApp(ctx));

  it('purgeExpired supprime plus de 500 inscriptions expirees (plusieurs lots) et laisse les recentes', async () => {
    const { purgeExpired } = await import('../../../../src/server/services/registrations.js');
    const old = await newActivity(ctx, { capacity: null, title: 'Ancienne' });
    const recent = await newActivity(ctx, { capacity: null, title: 'Recente' });
    await ctx.pool.query("UPDATE activities SET starts_at = now() - interval '20 months' WHERE id = $1", [old.id]);
    const ins = (activityId, n) => ctx.pool.query(
      `INSERT INTO registrations (activity_id, participant_name, is_minor, contact_name, contact_email, consent_at, consent_version, manage_token_hash)
       SELECT $1::uuid, 'P' || g, false, 'P' || g, 'p' || g || '@mail.fr', now(), '2026-10', md5(random()::text || g::text) FROM generate_series(1, $2) g`,
      [activityId, n],
    );
    await ins(old.id, 1203);
    await ins(recent.id, 3);
    const r = await purgeExpired(ctx.pool, { retentionMonths: 12 });
    expect(r.registrationsDeleted).toBe(1203);
    expect((await ctx.pool.query('SELECT count(*)::int AS n FROM registrations')).rows[0].n).toBe(3);
    expect((await purgeExpired(ctx.pool, { retentionMonths: 12 })).registrationsDeleted).toBe(0);
  });

  it('inscription refusee (409 activity_closed) des que la date de l’activite est passee, meme recemment', async () => {
    const a = await newActivity(ctx, { capacity: 5, title: 'Passee' });
    for (const past of ["now() - interval '1 minute'", "now() - interval '13 months'"]) {
      await ctx.pool.query(`UPDATE activities SET starts_at = ${past} WHERE id = $1`, [a.id]);
      expectConflict(await register(ctx, a.public_slug), 'activity_closed');
    }
    expect((await ctx.pool.query('SELECT count(*)::int AS n FROM registrations WHERE activity_id = $1', [a.id])).rows[0].n).toBe(0);
    await ctx.pool.query("UPDATE activities SET starts_at = now() + interval '1 day' WHERE id = $1", [a.id]);
    expect((await register(ctx, a.public_slug)).status).toBe(201);
  });
});

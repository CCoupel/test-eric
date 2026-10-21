// Integration : la purge RGPD (`npm run data:purge`, RETENTION_MONTHS) supprime aussi les mailings anciens (E13).
import { spawnSync } from 'node:child_process';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hasDb, closeApp } from '../../_support/harness.js';
import { mailingSetup } from '../../_support/mailing.js';

describe.skipIf(!hasDb)('Retention - mailings', () => {
  let ctx;
  let userId;
  beforeAll(async () => {
    ctx = await mailingSetup({ emails: [] });
    userId = (await ctx.api('get', '/api/auth/me')).body.user.id;
  });
  afterAll(() => closeApp(ctx));

  async function mailing(mois, sujet) {
    const { rows: [m] } = await ctx.pool.query(
      `INSERT INTO mailings (subject, body, sender_id, status, recipients_count, sent_count, failed_count, transport, created_at, completed_at)
       VALUES ($1, 'Corps avec donnees personnelles', $2, 'sent', 1, 1, 0, 'stub', now() - ($3 || ' months')::interval, now() - ($3 || ' months')::interval) RETURNING id`,
      [sujet, userId, String(mois)]);
    await ctx.pool.query('INSERT INTO mailing_activities (mailing_id, activity_id) VALUES ($1, $2)', [m.id, ctx.activity.id]);
    await ctx.pool.query(`INSERT INTO mailing_recipients (mailing_id, email, status) VALUES ($1, 'old@mail.fr', 'stubbed')`, [m.id]);
    return m.id;
  }
  const existe = async (id) => (await ctx.pool.query('SELECT 1 FROM mailings WHERE id = $1', [id])).rowCount === 1;
  const purge = (retention) =>
    spawnSync('npm', ['run', 'data:purge', '--silent'], {
      env: { ...process.env, RETENTION_MONTHS: retention, WSLENV: `${process.env.WSLENV ?? ''}:RETENTION_MONTHS` },
      encoding: 'utf-8', shell: true, timeout: 60_000,
    });

  it('RETENTION_MONTHS=12 : mailing de 14 mois supprime avec ses destinataires, mailing recent conserve', async () => {
    const vieux = await mailing(14, 'Vieux');
    const recent = await mailing(2, 'Recent');
    const res = purge('12');
    expect(res.status, res.stderr).toBe(0);
    expect(await existe(vieux)).toBe(false);
    expect(await existe(recent)).toBe(true);
    const { rows } = await ctx.pool.query('SELECT 1 FROM mailing_recipients WHERE mailing_id = $1', [vieux]);
    expect(rows).toHaveLength(0);
  });

  it('seuil configurable : RETENTION_MONTHS=3 supprime un mailing de 4 mois', async () => {
    const quatre = await mailing(4, 'Quatre mois');
    const un = await mailing(1, 'Un mois');
    expect(purge('3').status).toBe(0);
    expect(await existe(quatre)).toBe(false);
    expect(await existe(un)).toBe(true);
  });

  it('idempotent et sans donnee personnelle en sortie', async () => {
    await mailing(30, 'Tres vieux');
    const a = purge('12');
    const b = purge('12');
    expect(a.status).toBe(0);
    expect(b.status).toBe(0);
    expect(`${a.stdout}${a.stderr}`).not.toMatch(/old@mail\.fr|donnees personnelles/);
  });
});

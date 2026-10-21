// Integration : purge RGPD des inscriptions anciennes — script `npm run data:purge`, duree RETENTION_MONTHS
// (decision utilisateur : defaut 12 mois). Lance le script en sous-processus sur la base de test.
import { spawnSync } from 'node:child_process';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { hasDb, closeApp, validActivity } from '../../_support/harness.js';
import { setup } from '../../_support/inscription.js';

describe.skipIf(!hasDb)('Retention - data:purge', () => {
  let ctx;
  let userId;
  beforeAll(async () => {
    ctx = await setup();
    userId = (await ctx.api('get', '/api/auth/me')).body.user.id;
  });
  beforeEach(() => ctx.pool.query('TRUNCATE activities CASCADE'));
  afterAll(() => closeApp(ctx));

  // Activite + inscription "datees" de `mois` mois (starts_at ET created_at : independant du critere exact).
  async function seed(mois, tag) {
    const a = validActivity({ title: `Purge ${tag}` });
    const { rows: [act] } = await ctx.pool.query(
      `INSERT INTO activities (title, description, starts_at, location, capacity, status, public_slug, owner_id, created_at, updated_at)
       VALUES ($1, null, now() - ($2 || ' months')::interval, $3, 20, 'closed', $4, $5, now() - ($2 || ' months')::interval, now()) RETURNING id`,
      [a.title, String(mois), a.location, `purge${tag}`.padEnd(12, 'x').slice(0, 12), userId],
    );
    const { rows: [reg] } = await ctx.pool.query(
      `INSERT INTO registrations (activity_id, participant_name, is_minor, contact_name, contact_email, consent_at, consent_version, manage_token_hash, created_at)
       VALUES ($1, 'Enfant', true, 'Parent', $2, now(), '2026-10', $3, now() - ($4 || ' months')::interval) RETURNING id`,
      [act.id, `${tag}@mail.fr`, `hash-${tag}`, String(mois)],
    );
    return { activityId: act.id, regId: reg.id };
  }

  const purge = (env = {}) =>
    spawnSync('npm', ['run', 'data:purge', '--silent'], {
      env: { ...process.env, ...env, WSLENV: `${process.env.WSLENV ?? ''}:RETENTION_MONTHS` },
      encoding: 'utf-8', shell: true, timeout: 60_000,
    });
  const exists = async (id) => (await ctx.pool.query('SELECT 1 FROM registrations WHERE id = $1', [id])).rowCount === 1;

  it('RETENTION_MONTHS=12 : supprime les inscriptions de plus de 12 mois, garde les recentes', async () => {
    const vieille = await seed(14, 'vieille');
    const recente = await seed(2, 'recente');
    const res = purge({ RETENTION_MONTHS: '12' });
    expect(res.status, res.stderr).toBe(0);
    expect(await exists(vieille.regId)).toBe(false);
    expect(await exists(recente.regId)).toBe(true);
  });

  it('valeur par defaut = 12 mois quand RETENTION_MONTHS est absente', async () => {
    const vieille = await seed(13, 'defv');
    const recente = await seed(11, 'defr');
    const env = { ...process.env };
    delete env.RETENTION_MONTHS;
    const res = spawnSync('npm', ['run', 'data:purge', '--silent'], { env, encoding: 'utf-8', shell: true, timeout: 60_000 });
    expect(res.status, res.stderr).toBe(0);
    expect(await exists(vieille.regId)).toBe(false);
    expect(await exists(recente.regId)).toBe(true);
  });

  it('RETENTION_MONTHS=3 : le seuil est configurable', async () => {
    const quatre = await seed(4, 'quatre');
    const un = await seed(1, 'un');
    expect(purge({ RETENTION_MONTHS: '3' }).status).toBe(0);
    expect(await exists(quatre.regId)).toBe(false);
    expect(await exists(un.regId)).toBe(true);
  });

  it('anonymise mailing_recipients lies aux inscriptions purgees (ligne conservee)', async () => {
    const vieille = await seed(20, 'mail');
    const { rows: [m] } = await ctx.pool.query(
      `INSERT INTO mailings (subject, body, sender_id, status, recipients_count, sent_count, failed_count, transport, created_at, completed_at)
       VALUES ('S', 'C', $1, 'sent', 1, 1, 0, 'stub', now(), now()) RETURNING id`,
      [userId],
    );
    await ctx.pool.query(
      `INSERT INTO mailing_recipients (mailing_id, registration_id, email, status, sent_at) VALUES ($1, $2, 'mail@mail.fr', 'stubbed', now())`,
      [m.id, vieille.regId],
    );
    expect(purge({ RETENTION_MONTHS: '12' }).status).toBe(0);
    const { rows } = await ctx.pool.query('SELECT registration_id, email FROM mailing_recipients WHERE mailing_id = $1', [m.id]);
    expect(rows).toEqual([{ registration_id: null, email: null }]);
  });

  it('idempotent et sans donnees personnelles en sortie', async () => {
    await seed(30, 'idem');
    const premier = purge({ RETENTION_MONTHS: '12' });
    const second = purge({ RETENTION_MONTHS: '12' });
    expect(premier.status).toBe(0);
    expect(second.status).toBe(0);
    expect(`${premier.stdout}${premier.stderr}`).not.toContain('idem@mail.fr');
  });

  it.each(['abc', '0', '-5'])('RETENTION_MONTHS=%s invalide : echec (code != 0) et aucune suppression', async (valeur) => {
    const vieille = await seed(40, 'inval');
    const res = purge({ RETENTION_MONTHS: valeur });
    expect(res.status).not.toBe(0);
    expect(await exists(vieille.regId)).toBe(true);
  });
});

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { runMigrations } from '../../src/server/db/migrate.js';

const url = process.env.DATABASE_URL;
mkdirSync('_work/tmp', { recursive: true });
const tmp = mkdtempSync(join('_work/tmp', 'mig-'));
const write = (dir, name, sql) => writeFileSync(join(dir, name), sql);
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe('runMigrations — client simulé', () => {
  it("n'écrase pas l'erreur d'origine si ROLLBACK échoue, et libère le client", async () => {
    const dir = mkdtempSync(join(tmp, 'fake-'));
    write(dir, '001_a.sql', 'SELECT 1');
    let released = false;
    const client = {
      query: async (sql) => {
        if (/^(SELECT pg_advisory_lock|CREATE TABLE|SELECT name|BEGIN)/.test(sql)) return { rows: [] };
        if (sql === 'ROLLBACK') throw new Error('rollback impossible');
        if (/pg_advisory_unlock/.test(sql)) throw new Error('unlock impossible');
        throw new Error('boom');
      },
      release: () => { released = true; },
    };
    await expect(runMigrations({ connect: async () => client }, dir)).rejects.toThrow(/001_a\.sql en échec : boom/);
    expect(released).toBe(true);
  });
});

describe.skipIf(!url)('runMigrations — PostgreSQL (schéma isolé mig_test)', () => {
  let admin;
  let pool;
  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: url, max: 1 });
    await admin.query('DROP SCHEMA IF EXISTS mig_test CASCADE; CREATE SCHEMA mig_test');
    pool = new pg.Pool({ connectionString: url, max: 4, options: '-c search_path=mig_test' });
  });
  afterAll(async () => {
    await pool?.end();
    await admin?.query('DROP SCHEMA IF EXISTS mig_test CASCADE');
    await admin?.end();
  });
  beforeEach(() => pool.query('DROP TABLE IF EXISTS schema_migrations, t1, t2, bad'));

  it('applique dans l’ordre puis reste idempotente', async () => {
    const dir = mkdtempSync(join(tmp, 'ok-'));
    write(dir, '002_t2.sql', 'CREATE TABLE t2 (id int)');
    write(dir, '001_t1.sql', 'CREATE TABLE t1 (id int)');
    write(dir, 'README.md', 'ignoré');
    expect(await runMigrations(pool, dir)).toEqual(['001_t1.sql', '002_t2.sql']);
    expect(await runMigrations(pool, dir)).toEqual([]);
    const { rows } = await pool.query('SELECT name FROM schema_migrations ORDER BY name');
    expect(rows.map((r) => r.name)).toEqual(['001_t1.sql', '002_t2.sql']);
  });

  it('rollback complet d’une migration en échec, erreur remontée, les précédentes restent', async () => {
    const dir = mkdtempSync(join(tmp, 'ko-'));
    write(dir, '001_t1.sql', 'CREATE TABLE t1 (id int)');
    write(dir, '002_bad.sql', 'CREATE TABLE bad (id int); SELECT * FROM table_inexistante');
    await expect(runMigrations(pool, dir)).rejects.toThrow(/002_bad\.sql en échec/);
    const { rows } = await pool.query("SELECT to_regclass('bad') AS bad, to_regclass('t1') AS t1");
    expect(rows[0]).toEqual({ bad: null, t1: 't1' });
    const done = await pool.query('SELECT name FROM schema_migrations');
    expect(done.rows.map((r) => r.name)).toEqual(['001_t1.sql']);
  });

  it('le verrou sérialise deux runners concurrents : chaque migration appliquée une seule fois', async () => {
    const dir = mkdtempSync(join(tmp, 'lock-'));
    write(dir, '001_t1.sql', 'CREATE TABLE t1 (id int)');
    const [a, b] = await Promise.all([runMigrations(pool, dir), runMigrations(pool, dir)]);
    expect([...a, ...b]).toEqual(['001_t1.sql']);
  });
});

describe.skipIf(!url)('base de test globale', () => {
  it('001_init a été appliquée (citext, pgcrypto)', async () => {
    const pool = new pg.Pool({ connectionString: url, max: 1 });
    try {
      const { rows } = await pool.query("SELECT extname FROM pg_extension WHERE extname IN ('citext','pgcrypto')");
      expect(rows.map((r) => r.extname).sort()).toEqual(['citext', 'pgcrypto']);
      const m = await pool.query('SELECT name FROM schema_migrations');
      expect(m.rows.map((r) => r.name)).toContain('001_init.sql');
    } finally {
      await pool.end();
    }
  });
});

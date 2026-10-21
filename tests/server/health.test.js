import pg from 'pg';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/server/app.js';
import { loadConfig } from '../../src/server/config.js';

const url = process.env.DATABASE_URL;

describe('GET /health — base injoignable', () => {
  it('répond 503 avec db=error', async () => {
    const pool = { query: async () => { throw new Error('down'); } };
    const config = loadConfig({ DATABASE_URL: 'postgres://x@localhost/x', NODE_ENV: 'test' });
    const res = await request(createApp({ config, pool })).get('/health');
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: 'error', db: 'error', version: '0.1.0.0' });
  });
});

describe.skipIf(!url)('GET /health — intégration PostgreSQL', () => {
  const pool = new pg.Pool({ connectionString: url });
  afterAll(() => pool.end());

  it('répond 200 avec la version du contrat', async () => {
    const config = loadConfig({ DATABASE_URL: url, NODE_ENV: 'test' });
    const res = await request(createApp({ config, pool })).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', version: '0.1.0.0', db: 'ok' });
  });

  it('a appliqué 001_init (citext, pgcrypto)', async () => {
    const { rows } = await pool.query("SELECT extname FROM pg_extension WHERE extname IN ('citext','pgcrypto')");
    expect(rows.map((r) => r.extname).sort()).toEqual(['citext', 'pgcrypto']);
    const m = await pool.query('SELECT name FROM schema_migrations');
    expect(m.rows.map((r) => r.name)).toContain('001_init.sql');
  });
});

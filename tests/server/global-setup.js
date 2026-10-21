// Setup global Vitest (projet server) : base vide à chaque run + migrations appliquées.
// DATABASE_URL jamais codée en dur ; absente → les tests d'intégration sont ignorés (skipIf).
import pg from 'pg';
import { runMigrations } from '../../src/server/db/migrate.js';

export default async function setup() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.warn('[tests] DATABASE_URL absente : tests d\'intégration ignorés.');
    return;
  }
  const pool = new pg.Pool({ connectionString: url, max: 2 });
  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await runMigrations(pool);
  } finally {
    await pool.end();
  }
}

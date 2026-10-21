import pg from 'pg';

/** Pool PostgreSQL. Une erreur sur un client inactif (base redémarrée…) est journalisée, jamais fatale. */
export function createPool(config, log = console) {
  const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10, connectionTimeoutMillis: 3000 });
  pool.on('error', (err) => log.error({ err }, 'pool: erreur sur un client inactif'));
  return pool;
}

import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createPool } from './db/pool.js';
import { runMigrations } from './db/migrate.js';
import { seedAdmin } from './services/auth.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

/** Applique les migrations puis écoute ; retourne `{ server, pool, stop }` (stop = arrêt propre). */
export async function start(config = loadConfig(), log = console) {
  const pool = createPool(config, log);
  let server;
  try {
    const applied = await runMigrations(pool);
    if (applied.length) log.log(`Migrations appliquées : ${applied.join(', ')}`);
    await seedAdmin(pool, config, log);

    server = createApp({ config, pool }).listen(config.port);
    await new Promise((resolve, reject) => server.once('listening', resolve).once('error', reject));
  } catch (err) {
    await pool.end().catch(() => {});
    throw err;
  }

  const stop = () =>
    new Promise((resolve) => {
      const timer = setTimeout(() => server.closeAllConnections(), SHUTDOWN_TIMEOUT_MS);
      timer.unref();
      server.close(() => {
        clearTimeout(timer);
        pool.end().finally(resolve);
      });
      server.closeIdleConnections();
    });
  return { server, pool, stop };
}

/* v8 ignore start -- bootstrap process : couvert par le smoke E2E */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { server, stop } = await start();
  console.log(`Inscriptions-club à l'écoute sur :${server.address().port}`);
  const shutdown = () => stop().then(() => process.exit(0));
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
/* v8 ignore stop */

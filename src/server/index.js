import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createPool } from './db/pool.js';
import { runMigrations } from './db/migrate.js';
import { schedulePurge } from './jobs/purge.js';
import { seedAdmin } from './services/auth.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

/** Applique les migrations puis écoute ; retourne `{ server, pool, stop }` (stop = arrêt propre). */
export async function start(config = loadConfig(), log = console) {
  if (config.isProduction && config.https && !config.trustProxy) {
    // Derrière un reverse proxy TLS, sans TRUST_PROXY toutes les IP seraient celles du proxy : rate-limit mutualisé entre tous les visiteurs.
    log.warn?.('TRUST_PROXY non défini en production HTTPS : si un reverse proxy est devant, l’IP vue par les limiteurs sera celle du proxy (voir contracts/models.md).');
  }
  const pool = createPool(config, log);
  let server;
  let purge;
  try {
    const applied = await runMigrations(pool);
    if (applied.length) log.log(`Migrations appliquées : ${applied.join(', ')}`);
    await seedAdmin(pool, config, log);
    purge = schedulePurge(pool, config, log);

    server = createApp({ config, pool }).listen(config.port);
    await new Promise((resolve, reject) => server.once('listening', resolve).once('error', reject));
  } catch (err) {
    if (purge) clearInterval(purge.timer);
    await purge?.first;
    await pool.end().catch(() => {});
    throw err;
  }

  const stop = () =>
    new Promise((resolve) => {
      clearInterval(purge.timer);
      const timer = setTimeout(() => server.closeAllConnections(), SHUTDOWN_TIMEOUT_MS);
      timer.unref();
      server.close(() => {
        clearTimeout(timer);
        purge.first.finally(() => pool.end()).finally(resolve);
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

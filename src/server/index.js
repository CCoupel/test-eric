import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createPool } from './db/pool.js';
import { runMigrations } from './db/migrate.js';

const config = loadConfig();
const pool = createPool(config);
const applied = await runMigrations(pool);
if (applied.length) console.log(`Migrations appliquées : ${applied.join(', ')}`);

const server = createApp({ config, pool }).listen(config.port, () => {
  console.log(`Inscriptions-club à l'écoute sur :${config.port}`);
});

const shutdown = () => server.close(() => pool.end().finally(() => process.exit(0)));
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

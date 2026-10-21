// user:create — crée un responsable avec un mot de passe généré, affiché une seule fois.
import { loadConfig } from '../src/server/config.js';
import { runUserCreate } from '../src/server/cli/user-create.js';
import { createPool } from '../src/server/db/pool.js';

const pool = createPool(loadConfig());
try {
  const { user, password } = await runUserCreate(pool, process.argv.slice(2));
  console.log(`Compte créé : ${user.email} (${user.name})\nMot de passe (affiché une seule fois) : ${password}`);
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}

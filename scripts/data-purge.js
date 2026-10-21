// data:purge — purge RGPD (inscriptions > RETENTION_MONTHS après la date de l'activité). Idempotent ; affiche des compteurs seulement.
import { loadConfig } from '../src/server/config.js';
import { createPool } from '../src/server/db/pool.js';
import { purgeExpired } from '../src/server/services/registrations.js';

const config = loadConfig();
const pool = createPool(config);
try {
  const r = await purgeExpired(pool, { retentionMonths: config.retentionMonths });
  console.log(`Purge : ${r.registrationsDeleted} inscription(s) supprimée(s), ${r.recipientsAnonymized} destinataire(s) anonymisé(s), ${r.mailingsDeleted} envoi(s) supprimé(s).`);
} catch (err) {
  console.error(`Purge en échec : ${err.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}

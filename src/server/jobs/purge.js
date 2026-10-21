import { purgeExpired } from '../services/registrations.js';

const DAY_MS = 24 * 3600 * 1000;

/** Purge RGPD au démarrage puis chaque jour. Ne journalise que des compteurs. Retourne le timer (unref). */
export function schedulePurge(pool, config, log = console) {
  const run = async () => {
    try {
      const r = await purgeExpired(pool, { retentionMonths: config.retentionMonths });
      if (r.registrationsDeleted) log.log?.(`Purge RGPD : ${r.registrationsDeleted} inscription(s) supprimée(s), ${r.recipientsAnonymized} destinataire(s) anonymisé(s).`);
    } catch (err) {
      log.error?.({ message: err.message, code: err.code }, 'purge RGPD en échec');
    }
  };
  const first = run();
  const timer = setInterval(run, DAY_MS);
  timer.unref();
  return { timer, first };
}

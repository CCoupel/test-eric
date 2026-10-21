// Lecture et validation de l'environnement (contrat : contracts/models.md « Variables d'environnement »).
const NODE_ENVS = ['development', 'test', 'production'];

export class ConfigError extends Error {
  constructor(problems) {
    super(`Configuration invalide : ${problems.join(' ; ')}`);
    this.name = 'ConfigError';
    this.problems = problems;
  }
}

const blank = (v) => v === undefined || v === null || String(v).trim() === '';

export function loadConfig(env = process.env) {
  const problems = [];
  const str = (name, def) => (blank(env[name]) ? def : String(env[name]).trim());

  const nodeEnv = str('NODE_ENV', 'development');
  if (!NODE_ENVS.includes(nodeEnv)) problems.push(`NODE_ENV doit valoir ${NODE_ENVS.join('|')}`);

  const portRaw = str('APP_PORT', '3000');
  const port = Number(portRaw);
  if (!Number.isInteger(port) || port < 0 || port > 65535) problems.push('APP_PORT doit être un port valide');

  const baseUrl = str('APP_BASE_URL', nodeEnv === 'production' ? undefined : `http://localhost:${portRaw}`);
  if (blank(baseUrl)) problems.push('APP_BASE_URL est obligatoire');
  else {
    try {
      new URL(baseUrl);
    } catch {
      problems.push('APP_BASE_URL doit être une URL absolue');
    }
  }

  const databaseUrl = str('DATABASE_URL');
  if (!databaseUrl) problems.push('DATABASE_URL est obligatoire');
  else if (!/^postgres(ql)?:\/\//.test(databaseUrl)) problems.push('DATABASE_URL doit commencer par postgres://');

  if (problems.length) throw new ConfigError(problems);

  return {
    nodeEnv,
    isProduction: nodeEnv === 'production',
    port,
    baseUrl: baseUrl.replace(/\/+$/, ''),
    // HTTPS déduit de APP_BASE_URL : conditionne HSTS et upgrade-insecure-requests (QUALIF en http://localhost).
    https: new URL(baseUrl).protocol === 'https:',
    databaseUrl,
    consentTextVersion: str('CONSENT_TEXT_VERSION', '2026-10'),
  };
}

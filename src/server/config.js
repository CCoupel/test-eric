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

  // Session : secret ≥ 32 car. obligatoire (valeur fixe tolérée uniquement quand NODE_ENV=test).
  let sessionSecret = str('SESSION_SECRET');
  if (!sessionSecret && nodeEnv === 'test') sessionSecret = 'test-only-secret-test-only-secret-0123456789';
  if (!sessionSecret) problems.push('SESSION_SECRET est obligatoire');
  else if (sessionSecret.length < 32) problems.push('SESSION_SECRET doit faire au moins 32 caractères');

  // Compte initial (seed idempotent) : tout ou rien.
  const admin = { email: str('ADMIN_EMAIL'), password: str('ADMIN_PASSWORD'), name: str('ADMIN_NAME', 'Administrateur') };
  const adminSet = [env.ADMIN_EMAIL, env.ADMIN_PASSWORD].filter((v) => !blank(v)).length;
  if (adminSet === 1) problems.push('ADMIN_EMAIL et ADMIN_PASSWORD doivent être fournis ensemble');
  if (admin.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(admin.email)) problems.push('ADMIN_EMAIL invalide');
  if (admin.password && admin.password.length < 12) problems.push('ADMIN_PASSWORD doit faire au moins 12 caractères');

  if (problems.length) throw new ConfigError(problems);

  return {
    nodeEnv,
    isProduction: nodeEnv === 'production',
    port,
    baseUrl: baseUrl.replace(/\/+$/, ''),
    // HTTPS déduit de APP_BASE_URL : conditionne HSTS et upgrade-insecure-requests (QUALIF en http://localhost).
    https: new URL(baseUrl).protocol === 'https:',
    databaseUrl,
    sessionSecret,
    admin: admin.email ? admin : null,
    consentTextVersion: str('CONSENT_TEXT_VERSION', '2026-10'),
  };
}

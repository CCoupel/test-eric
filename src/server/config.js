import { isSingleAddress } from './address.js';
// Lecture et validation de l'environnement (contrat : contracts/models.md « Variables d'environnement »).
const NODE_ENVS = ['development', 'test', 'production'];

export class ConfigError extends Error {
  constructor(problems) {
    super(`Configuration invalide : ${problems.join(' ; ')}`);
    this.name = 'ConfigError';
    this.problems = problems;
  }
}

// Valeurs d'exemple / triviales refusées pour le mot de passe admin (le seed ne le change jamais ensuite).
const WEAK_PASSWORD_PARTS = ['changeme', 'change-me', 'password', 'motdepasse', 'azerty', 'qwerty', '123456', 'example', 'exemple', 'admin'];

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
  else if (new Set(sessionSecret).size < 10) problems.push('SESSION_SECRET trop peu varié (valeur d\'exemple ?)');

  // Compte initial (seed idempotent) : tout ou rien.
  const admin = { email: str('ADMIN_EMAIL'), password: str('ADMIN_PASSWORD'), name: str('ADMIN_NAME', 'Administrateur') };
  const adminSet = [env.ADMIN_EMAIL, env.ADMIN_PASSWORD].filter((v) => !blank(v)).length;
  if (adminSet === 1) problems.push('ADMIN_EMAIL et ADMIN_PASSWORD doivent être fournis ensemble');
  if (admin.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(admin.email)) problems.push('ADMIN_EMAIL invalide');
  if (admin.password && admin.password.length < 12) problems.push('ADMIN_PASSWORD doit faire au moins 12 caractères');
  else if (admin.password && Buffer.byteLength(admin.password) > 72) problems.push('ADMIN_PASSWORD: 72 octets maximum (limite de bcrypt)');
  else if (admin.password && WEAK_PASSWORD_PARTS.some((w) => admin.password.toLowerCase().includes(w))) {
    problems.push('ADMIN_PASSWORD est une valeur triviale ou d\'exemple');
  }

  // Contact RGPD affiché sur la page de confidentialité : CONTACT_EMAIL uniquement (jamais de repli sur ADMIN_EMAIL, qui est un identifiant de connexion).
  const contactEmail = str('CONTACT_EMAIL') || null;
  if (contactEmail && !isSingleAddress(contactEmail)) problems.push('CONTACT_EMAIL invalide (adresse simple attendue)');

  const consentBase = str('CONSENT_TEXT_VERSION', '2026-10');

  // Conservation RGPD : purge des inscriptions N mois après la date de l'activité (défaut 12).
  const retentionRaw = str('RETENTION_MONTHS', '12');
  const retentionMonths = Number(retentionRaw);
  if (!/^\d+$/.test(retentionRaw) || retentionMonths < 1 || retentionMonths > 120) problems.push('RETENTION_MONTHS doit être un entier entre 1 et 120');

  // Limites anti-abus des routes publiques (valeurs par défaut sûres ; surchargeables pour les tests/QUALIF).
  const intVar = (name, def, max = 100_000) => {
    const raw = str(name, String(def));
    const n = Number(raw);
    if (!/^\d+$/.test(raw) || n < 1 || n > max) problems.push(`${name} doit être un entier entre 1 et ${max}`);
    return n;
  };
  const publicLimits = {
    registrationPerIpPerMin: intVar('RATE_LIMIT_REGISTRATION_PER_IP_MIN', 20),
    registrationPerActivityPer10Min: intVar('RATE_LIMIT_REGISTRATION_PER_ACTIVITY_10MIN', 10),
    tokenPerIpPerMin: intVar('RATE_LIMIT_TOKEN_PER_IP_MIN', 30),
    viewPerIpPerMin: intVar('RATE_LIMIT_VIEW_PER_IP_MIN', 60),
  };

  const authLimits = { loginPerIpPerMin: intVar('RATE_LIMIT_LOGIN_PER_IP_MIN', 10) };
  // Garde-fou : en production, relever la limite de login au-delà de 50/min/IP affaiblirait le bruteforce-guard (surcharge réservée aux tests/E2E).
  if (nodeEnv === 'production' && authLimits.loginPerIpPerMin > 50) problems.push('RATE_LIMIT_LOGIN_PER_IP_MIN ne doit pas dépasser 50 en production'); // login : 10/min/IP (contrat), relevé uniquement pour l'E2E

  // Messagerie : SMTP réel si SMTP_HOST + MAIL_FROM, sinon transport « stub » (rien n'est envoyé).
  const smtpHost = str('SMTP_HOST');
  const mailFrom = str('MAIL_FROM');
  const smtpUser = str('SMTP_USER');
  const smtpPass = env.SMTP_PASS === undefined || String(env.SMTP_PASS) === '' ? undefined : String(env.SMTP_PASS);
  const smtpSecureRaw = str('SMTP_SECURE', 'false');
  if (!['true', 'false'].includes(smtpSecureRaw)) problems.push('SMTP_SECURE doit valoir true ou false');
  const smtpPort = Number(str('SMTP_PORT', smtpSecureRaw === 'true' ? '465' : '587'));
  if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) problems.push('SMTP_PORT doit être un port valide');
  if (Boolean(smtpHost) !== Boolean(mailFrom)) problems.push('SMTP_HOST et MAIL_FROM doivent être fournis ensemble');
  if (Boolean(smtpUser) !== Boolean(smtpPass)) problems.push('SMTP_USER et SMTP_PASS doivent être fournis ensemble');
  if (mailFrom && !/^(?:[^<>\r\n"@]+ )?<?[^\s<>@,;"]+@[^\s<>@,;"]+\.[^\s<>@,;"]+>?$/.test(mailFrom)) {
    problems.push('MAIL_FROM doit être une adresse unique (« a@b.fr » ou « Nom <a@b.fr> »), sans retour à la ligne');
  }
  if (smtpHost && /[\s/]/.test(smtpHost)) problems.push('SMTP_HOST invalide');
  // TLS imposé par défaut sauf pour un hôte local (relais de développement) ; SMTP_REQUIRE_TLS=false pour forcer le clair sur un hôte distant (déconseillé).
  const requireTlsRaw = str('SMTP_REQUIRE_TLS');
  if (requireTlsRaw !== undefined && !['true', 'false'].includes(requireTlsRaw)) problems.push('SMTP_REQUIRE_TLS doit valoir true ou false');
  const localSmtp = smtpHost ? /^(localhost|127\.\d+\.\d+\.\d+|\[?::1\]?)$/i.test(smtpHost) : false;
  const requireTls = requireTlsRaw === undefined ? !localSmtp : requireTlsRaw === 'true';
  const mail = smtpHost && mailFrom
    ? { transport: 'smtp', host: smtpHost, port: smtpPort, secure: smtpSecureRaw === 'true', requireTls, user: smtpUser ?? null, pass: smtpPass ?? null, from: mailFrom }
    : { transport: 'stub', from: mailFrom ?? null };
  const mailLimits = {
    perUserPer10Min: intVar('RATE_LIMIT_MAILING_PER_USER_10MIN', 5),
    maxRecipients: intVar('MAILING_MAX_RECIPIENTS', 500, 5000),
    syncMaxRecipients: intVar('MAILING_SYNC_MAX_RECIPIENTS', 100, 5000),
    confirmationPerAddressPerHour: intVar('RATE_LIMIT_CONFIRMATION_PER_ADDRESS_HOUR', 3),
    confirmationGlobalPerHour: intVar('RATE_LIMIT_CONFIRMATION_GLOBAL_HOUR', 300),
    unsubscribePerIpPerMin: intVar('RATE_LIMIT_UNSUBSCRIBE_PER_IP_MIN', 300),
  };

  // TRUST_PROXY : nombre de sauts de proxy de confiance (ex. 1), ou liste d'IP/CIDR/alias Express. `true` est refusé (IP usurpable).
  const trustRaw = str('TRUST_PROXY', 'false');
  let trustProxy = false;
  if (trustRaw === 'true') problems.push('TRUST_PROXY=true refusé : indiquer le nombre de proxys (ex. 1) ou leurs adresses');
  else if (/^\d+$/.test(trustRaw)) trustProxy = Number(trustRaw);
  else if (trustRaw !== 'false') trustProxy = trustRaw;

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
    trustProxy,
    contactEmail,
    retentionMonths,
    publicLimits,
    authLimits,
    mail,
    mailLimits,
    admin: admin.email ? admin : null,
    // La version identifie le texte accepté, qui interpole la durée de conservation : hors défaut (12 mois), suffixe `-r<N>`.
    consentTextVersion: retentionMonths === 12 ? consentBase : `${consentBase}-r${retentionMonths}`,
  };
}

import { HttpError } from '../errors.js';
import { COOKIE_NAME, findUserById, verifySession } from '../services/auth.js';

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    const key = i < 0 ? '' : part.slice(0, i).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      /* cookie mal encodé : ignoré */
    }
  }
  return out;
}

const unauthenticated = () => new HttpError(401, 'unauthenticated', 'Authentification requise');

/** Exige un cookie `sid` valide ET un utilisateur existant (un compte supprimé invalide la session). */
export const requireSession = (config, pool) => async (req, _res, next) => {
  const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
  const payload = token && verifySession(token, config);
  if (!payload) throw unauthenticated();
  const user = await findUserById(pool, payload.sub);
  if (!user || payload.tv !== user.token_version) throw unauthenticated(); // compte supprimé ou session révoquée
  req.user = user;
  next();
};

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

/**
 * Origines acceptées : celle de APP_BASE_URL ; si elle est en loopback (poste de dev, QUALIF locale), ses alias loopback
 * (localhost / 127.0.0.1 / [::1]) avec le MÊME protocole et le MÊME port — un navigateur ouvert sur http://127.0.0.1:8080
 * envoie cette Origin même si APP_BASE_URL vaut http://localhost:8080. Sans effet pour une URL publique.
 */
export function allowedOrigins(baseUrl) {
  const u = new URL(baseUrl);
  const set = new Set([u.origin]);
  if (LOOPBACK_HOSTS.includes(u.hostname)) {
    for (const h of LOOPBACK_HOSTS) set.add(`${u.protocol}//${h}${u.port ? `:${u.port}` : ''}`);
  }
  return set;
}

/**
 * CSRF sur les méthodes non sûres :
 *  - `Origin` présent → doit être celui de APP_BASE_URL (ou un alias loopback de même port si APP_BASE_URL est en loopback) (en dev, APP_BASE_URL = origine visible du navigateur) ;
 *  - `Origin` absent → refusé si la requête porte le cookie de session ;
 *  - `Sec-Fetch-Site: cross-site` → refusé.
 */
export const checkOrigin = (config) => {
  const allowed = allowedOrigins(config.baseUrl);
  const expected = new URL(config.baseUrl).origin;
  // Message explicite : adresse à utiliser (APP_BASE_URL est public : présent dans les liens d'inscription).
  const forbidden = (origin) =>
    new HttpError(403, 'forbidden', `Origine refusée : ouvrez l’application à l’adresse ${expected}${origin ? ` (reçu : ${String(origin).slice(0, 100)})` : ''}`);
  return (req, _res, next) => {
    if (SAFE.has(req.method)) return next();
    if (req.headers['sec-fetch-site'] === 'cross-site') throw forbidden();
    const origin = req.headers.origin;
    if (origin) {
      if (!allowed.has(origin)) throw forbidden(origin);
    } else if (parseCookies(req.headers.cookie)[COOKIE_NAME]) {
      throw forbidden();
    }
    next();
  };
};

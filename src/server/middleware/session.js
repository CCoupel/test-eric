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

/**
 * CSRF sur les méthodes non sûres :
 *  - `Origin` présent → doit être exactement celui de APP_BASE_URL (en dev, APP_BASE_URL = origine visible du navigateur) ;
 *  - `Origin` absent → refusé si la requête porte le cookie de session ;
 *  - `Sec-Fetch-Site: cross-site` → refusé.
 */
export const checkOrigin = (config) => {
  const allowed = new URL(config.baseUrl).origin;
  const forbidden = () => new HttpError(403, 'forbidden', 'Origine refusée');
  return (req, _res, next) => {
    if (SAFE.has(req.method)) return next();
    if (req.headers['sec-fetch-site'] === 'cross-site') throw forbidden();
    const origin = req.headers.origin;
    if (origin) {
      if (origin !== allowed) throw forbidden();
    } else if (parseCookies(req.headers.cookie)[COOKIE_NAME]) {
      throw forbidden();
    }
    next();
  };
};

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
  if (!user) throw unauthenticated();
  req.user = user;
  next();
};

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/** CSRF : sur les méthodes non sûres, un en-tête Origin présent doit être celui de l'application. */
export const checkOrigin = (config) => (req, _res, next) => {
  const origin = req.headers.origin;
  if (SAFE.has(req.method) || !origin) return next();
  let host;
  try {
    host = new URL(origin).host;
  } catch {
    throw new HttpError(403, 'forbidden', 'Origine refusée');
  }
  if (origin === new URL(config.baseUrl).origin || host === req.headers.host) return next();
  throw new HttpError(403, 'forbidden', 'Origine refusée');
};

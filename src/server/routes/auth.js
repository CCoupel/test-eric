import { Router } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { HttpError, parse } from '../errors.js';
import { requireSession } from '../middleware/session.js';
import { COOKIE_NAME, authenticate, cookieOptions, normalizeEmail, publicUser, revokeSessions, signSession } from '../services/auth.js';

const MAX_BCRYPT_BYTES = 72; // bcrypt ignore le reste : on refuse plutôt que de tronquer silencieusement
const loginSchema = z.strictObject({
  email: z.string().trim().min(1, 'e-mail requis').max(254),
  password: z.string().min(1, 'mot de passe requis').refine((v) => Buffer.byteLength(v) <= MAX_BCRYPT_BYTES, '72 octets maximum'),
});

export function authRoutes({ config, pool, loginLimit = config.authLimits.loginPerIpPerMin, loginEmailLimit = 5 }) {
  const router = Router();

  // 10 tentatives / min / IP, comptées succès compris (contrat).
  const limiter = rateLimit({
    windowMs: 60_000,
    limit: loginLimit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, _res, next) => {
      req.log.warn({ event: 'login_rate_limited', ip: req.ip, scope: 'ip' }, 'auth');
      next(new HttpError(429, 'rate_limited', 'Trop de tentatives, réessayez dans une minute'));
    },
  });

  // Anti-bruteforce ciblé : `loginEmailLimit` échecs / 15 min par e-mail normalisé (les succès ne comptent pas).
  const emailLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: loginEmailLimit,
    skipSuccessfulRequests: true,
    standardHeaders: false,
    legacyHeaders: false,
    keyGenerator: (req) => {
      // Exécuté avant la validation zod : clé bornée à 254 car. (RFC 5321) pour ne pas gonfler le store avec des chaînes géantes.
      const email = req.body?.email;
      return typeof email === 'string' && email.trim()
        ? `email:${normalizeEmail(email.slice(0, 254 + 64)).slice(0, 254)}`
        : ipKeyGenerator(req.ip);
    },
    handler: (req, _res, next) => {
      req.log.warn({ event: 'login_rate_limited', ip: req.ip, scope: 'email' }, 'auth');
      next(new HttpError(429, 'rate_limited', 'Trop d’échecs pour ce compte, réessayez plus tard'));
    },
  });

  router.post('/login', limiter, emailLimiter, async (req, res) => {
    const { email, password } = parse(loginSchema, req.body ?? {});
    const user = await authenticate(pool, email, password);
    if (!user) {
      req.log.warn({ event: 'login_failed', ip: req.ip }, 'auth'); // jamais l'e-mail en clair
      throw new HttpError(401, 'invalid_credentials', 'E-mail ou mot de passe incorrect');
    }
    req.log.info({ event: 'login_ok', userId: user.id }, 'auth');
    res.cookie(COOKIE_NAME, signSession(user, config), cookieOptions(config));
    res.json({ user: publicUser(user) });
  });

  router.post('/logout', requireSession(config, pool), async (req, res) => {
    await revokeSessions(pool, req.user.id);
    res.clearCookie(COOKIE_NAME, { ...cookieOptions(config), maxAge: undefined });
    res.status(204).end();
  });

  router.get('/me', requireSession(config, pool), (req, res) => res.json({ user: publicUser(req.user) }));

  return router;
}

import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { HttpError, parse } from '../errors.js';
import { FailureLimiter } from '../middleware/failure-limiter.js';
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

  // Anti-bruteforce ciblé : `loginEmailLimit` ÉCHECS / 15 min par e-mail normalisé. Seuls les échecs d'authentification comptent
  // (pas les requêtes en vol) : 10 connexions valides simultanées ne déclenchent jamais le blocage.
  const failures = new FailureLimiter({ limit: loginEmailLimit, windowMs: 15 * 60_000 });

  router.post('/login', limiter, async (req, res) => {
    const { email, password } = parse(loginSchema, req.body ?? {});
    const key = normalizeEmail(email); // email déjà borné à 254 car. par le schéma
    if (failures.isBlocked(key)) {
      req.log.warn({ event: 'login_rate_limited', ip: req.ip, scope: 'email' }, 'auth');
      throw new HttpError(429, 'rate_limited', 'Trop d’échecs pour ce compte, réessayez plus tard');
    }
    const user = await authenticate(pool, email, password);
    if (!user) {
      failures.fail(key);
      req.log.warn({ event: 'login_failed', ip: req.ip }, 'auth'); // jamais l'e-mail en clair
      throw new HttpError(401, 'invalid_credentials', 'E-mail ou mot de passe incorrect');
    }
    failures.reset(key);
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

import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { HttpError, parse } from '../errors.js';
import { requireSession } from '../middleware/session.js';
import { COOKIE_NAME, authenticate, cookieOptions, publicUser, signSession } from '../services/auth.js';

const loginSchema = z.object({
  email: z.string().trim().min(1, 'e-mail requis').max(254),
  password: z.string().min(1, 'mot de passe requis').max(200),
});

export function authRoutes({ config, pool, loginLimit = 10 }) {
  const router = Router();

  // 10 tentatives / min / IP, comptées succès compris (contrat).
  const limiter = rateLimit({
    windowMs: 60_000,
    limit: loginLimit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, _res, next) => next(new HttpError(429, 'rate_limited', 'Trop de tentatives, réessayez dans une minute')),
  });

  router.post('/login', limiter, async (req, res) => {
    const { email, password } = parse(loginSchema, req.body ?? {});
    const user = await authenticate(pool, email, password);
    if (!user) throw new HttpError(401, 'invalid_credentials', 'E-mail ou mot de passe incorrect');
    res.cookie(COOKIE_NAME, signSession(user, config), cookieOptions(config));
    res.json({ user: publicUser(user) });
  });

  router.post('/logout', requireSession(config, pool), (_req, res) => {
    res.clearCookie(COOKIE_NAME, { ...cookieOptions(config), maxAge: undefined });
    res.status(204).end();
  });

  router.get('/me', requireSession(config, pool), (req, res) => res.json({ user: publicUser(req.user) }));

  return router;
}

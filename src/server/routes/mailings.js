import { Router } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { HttpError, parse } from '../errors.js';
import { requireSession } from '../middleware/session.js';
import * as svc from '../services/mailings.js';

export function mailingRoutes({ config, pool, mailings }) {
  const router = Router();
  router.use(requireSession(config, pool));

  // Limite d'envois par responsable (en plus du verrou « un seul envoi à la fois » et du plafond de destinataires).
  const createLimiter = rateLimit({
    windowMs: 10 * 60_000,
    limit: config.mailLimits.perUserPer10Min,
    standardHeaders: false,
    legacyHeaders: false,
    keyGenerator: (req) => (req.user ? `user:${req.user.id}` : ipKeyGenerator(req.ip)),
    handler: (req, _res, next) => {
      req.log.warn({ event: 'mailing_rate_limited', userId: req.user?.id }, 'mailing');
      next(new HttpError(429, 'rate_limited', 'Trop d’envois récents, réessayez dans quelques minutes'));
    },
  });

  router.get('/recipients-preview', async (req, res) => {
    const { activity_ids } = parse(svc.previewQuerySchema, req.query);
    res.json(await svc.previewRecipients(pool, activity_ids));
  });

  router.post('/', createLimiter, async (req, res) => {
    const input = parse(svc.createSchema, req.body ?? {});
    const { mailing, background } = await mailings.create(req.user, input, req.log);
    res.status(background ? 202 : 201).json({ mailing });
  });

  router.get('/', async (_req, res) => res.json({ mailings: await svc.listMailings(pool) }));

  router.get('/:id', async (req, res) => {
    const result = await svc.getMailing(pool, req.params.id);
    // Cette réponse contient des adresses e-mail : accès tracé (qui, quel envoi), sans donnée personnelle.
    req.log.info({ event: 'mailing_viewed', userId: req.user.id, mailingId: req.params.id }, 'accès au détail d’un envoi');
    res.json(result);
  });

  return router;
}

/** GET /api/mail/status : mode et expéditeur seulement (jamais hôte, utilisateur ni mot de passe SMTP). */
export function mailStatusRoutes({ config, pool, mailer }) {
  const router = Router();
  router.get('/status', requireSession(config, pool), (_req, res) => res.json({ transport: mailer.transport, from: mailer.from }));
  return router;
}

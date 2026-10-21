import { Router } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { HttpError, parse } from '../errors.js';
import { confirmationMessage } from '../mailer/render.js';
import * as svc from '../services/registrations.js';
import { describeUnsubscribe, unsubscribe } from '../services/unsubscribe.js';
import { SLUG_RE } from '../services/registrations.js';

const tooMany = (msg) => (req, _res, next) => {
  req.log.warn({ event: 'public_rate_limited', ip: req.ip, path: req.route?.path }, 'public');
  next(new HttpError(429, 'rate_limited', msg));
};

const limiter = (windowMs, limit, handler, keyGenerator) =>
  rateLimit({ windowMs, limit, standardHeaders: false, legacyHeaders: false, handler, ...(keyGenerator && { keyGenerator }) });

/** Routes publiques (sans compte) : fiche d'activité, inscription, gestion par token. */
export function publicRoutes({ config, pool, mailer }) {
  const router = Router();
  const lim = config.publicLimits;
  const msg = 'Trop de requêtes, réessayez dans un moment';

  const view = limiter(60_000, lim.viewPerIpPerMin, tooMany(msg));
  const token = limiter(60_000, lim.tokenPerIpPerMin, tooMany(msg));
  const registerIp = limiter(60_000, lim.registrationPerIpPerMin, tooMany(msg));
  // Anti-remplissage : limite plus stricte par IP + activité (slug), en plus de la limite par IP.
  const registerActivity = limiter(10 * 60_000, lim.registrationPerActivityPer10Min, tooMany(msg), (req) =>
    `${ipKeyGenerator(req.ip)}|${SLUG_RE.test(req.params.slug) ? req.params.slug : 'invalid'}`,
  );

  // Informations légales publiques (page de confidentialité) : lecture seule, aucune donnée personnelle d'inscrit.
  router.get('/info', view, (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ contact_email: config.contactEmail, consent_version: config.consentTextVersion, retention_months: config.retentionMonths });
  });

  router.get('/activities/:slug', view, async (req, res) => {
    res.json(svc.toPublicActivity(await svc.findPublicActivity(pool, req.params.slug), config));
  });

  router.post('/activities/:slug/registrations', registerIp, registerActivity, async (req, res) => {
    const activity = await svc.findPublicActivity(pool, req.params.slug); // 404 (inconnu / brouillon) avant la validation du corps
    const input = parse(svc.createRegistrationSchema, req.body ?? {});
    if (input.hp_extra) {
      req.log.warn({ event: 'registration_honeypot', ip: req.ip }, 'public');
      return res.status(201).json(svc.fakeRegistration(config, input)); // le robot croit avoir réussi
    }
    const created = await svc.createRegistration(pool, config, req.params.slug, input, req.log);
    // E-mail de confirmation (porte le lien de gestion) : jamais bloquant ni journalisé (ni adresse, ni contenu, ni token).
    mailer
      .send({
        to: input.contact_email,
        ...confirmationMessage({ config, activityTitle: activity.title, participantName: input.participant_name, manageUrl: created.manage_url }),
      })
      .catch((err) => req.log.warn({ event: 'confirmation_mail_failed', code: err.code ?? 'other' }, 'e-mail de confirmation non envoyé'));
    res.status(201).json(created);
  });

  router.get('/registrations/:token', token, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(await svc.getByToken(pool, config, req.params.token));
  });

  router.delete('/registrations/:token', token, async (req, res) => {
    await svc.deleteByToken(pool, req.params.token, req.log);
    res.status(204).end();
  });

  // Désabonnement des e-mails groupés (RFC 8058). GET = page de confirmation (non mutant) ; POST = action (aussi « one-click » depuis le client mail).
  router.get('/unsubscribe/:token', token, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(await describeUnsubscribe(pool, req.params.token));
  });

  router.post('/unsubscribe/:token', token, async (req, res) => {
    await unsubscribe(pool, req.params.token, req.log);
    res.status(204).end();
  });

  return router;
}

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import { loadConfig } from './config.js';
import { HttpError } from './errors.js';
import { checkOrigin } from './middleware/session.js';
import { activityRoutes } from './routes/activities.js';
import { authRoutes } from './routes/auth.js';
import { createMailer } from './mailer/index.js';
import { mailStatusRoutes, mailingRoutes } from './routes/mailings.js';
import { publicRoutes } from './routes/public.js';
import { createMailingService } from './services/mailings.js';
import { createPool } from './db/pool.js';
import pino from 'pino';
import pinoHttp from 'pino-http';

const here = dirname(fileURLToPath(import.meta.url));
const { version } = JSON.parse(readFileSync(join(here, '../../package.json'), 'utf-8'));

export const REDACT_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'res.headers["set-cookie"]',
  'req.body.password',
  'req.body.email',
  'req.body.contact_email',
  'req.body.participant_name',
  'req.body.contact_name',
  'req.headers.referer', // peut contenir /r/<token>
];

/** Masque les tokens de gestion dans les URLs journalisées (le token donne accès aux données d'un participant, parfois mineur). */
export function maskUrl(url = '') {
  return String(url)
    .replace(/^(\/api\/public\/registrations\/)[^/?#]*/i, '$1[redacted]') // Express route sans tenir compte de la casse
    .replace(/^(\/r\/)[^/?#]*/i, '$1[redacted]')
    .replace(/^(\/u\/)[^/?#]*/i, '$1[redacted]')
    .replace(/^(\/api\/public\/unsubscribe\/)[^/?#]*/i, '$1[redacted]')
    // Filet de sécurité : toute séquence de la forme d'un token (43 car. base64url) est masquée, même sous un chemin inattendu (`//r/…`, `%72`…).
    .replace(/(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])/g, '[redacted]');
}
const serializers = { req: pino.stdSerializers.wrapRequestSerializer((r) => ({ ...r, url: maskUrl(r.url) })) };

// Sans argument : config lue dans l'environnement (DATABASE_URL…) et pool créé ; `app.locals.pool` permet de le fermer.
export function createApp({ config = loadConfig(), pool = createPool(config), logger, loginLimit, loginEmailLimit, mailer: mailerOpt, webDir: webDirOpt = join(here, '../../dist/web') } = {}) {
  const webDir = resolve(webDirOpt); // absolu ; sendFile avec `root` évite le rejet des chemins contenant un segment « .xxx » (ex. .claude/worktrees)
  const log = logger ?? pino({ level: config.nodeEnv === 'test' ? 'silent' : 'info', redact: REDACT_PATHS });
  const app = express();
  const mailer = mailerOpt ?? createMailer(config, log);
  const mailings = createMailingService({ pool, config, mailer });
  app.locals.pool = pool;
  app.locals.mailer = mailer;
  app.locals.mailings = mailings;
  // Au démarrage : envois restés « sending » (crash, SIGTERM) clos, jamais repris. `app.locals.ready` permet de l'attendre.
  app.locals.ready = Promise.resolve()
    .then(() => mailings.recoverOrphans())
    .catch((err) => log.error({ event: 'mailing_recover_error', code: err?.code }, 'récupération des envois orphelins impossible'));
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy); // false par défaut ; TRUST_PROXY pour l'IP réelle derrière un reverse proxy
  // Hors HTTPS (ex. QUALIF http://localhost) : ni HSTS ni upgrade-insecure-requests, sinon le navigateur casse les assets.
  app.use(
    helmet(
      config.https
        ? {}
        : { strictTransportSecurity: false, contentSecurityPolicy: { directives: { 'upgrade-insecure-requests': null } } },
    ),
  );
  app.use(pinoHttp({ logger: log, redact: REDACT_PATHS, serializers, autoLogging: { ignore: (req) => req.url === '/health' } }));
  app.use(express.json({ limit: '100kb' }));

  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store'); // données personnelles : jamais en cache partagé
    next();
  });
  app.use('/api', checkOrigin(config));
  app.use('/api/auth', authRoutes({ config, pool, loginLimit, loginEmailLimit }));
  app.use('/api/activities', activityRoutes({ config, pool }));
  app.use('/api/public', publicRoutes({ config, pool, mailer }));
  app.use('/api/mailings', mailingRoutes({ config, pool, mailings }));
  app.use('/api/mail', mailStatusRoutes({ config, pool, mailer }));

  app.get('/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok', version, db: 'ok' });
    } catch (err) {
      res.log.error({ err }, 'health: base injoignable');
      res.status(503).json({ status: 'error', version, db: 'error' });
    }
  });

  // Statique du front (dist/web) + fallback SPA hors /api et /health.
  if (existsSync(join(webDir, 'index.html'))) {
    app.use(express.static(webDir, { index: false }));
    app.get(/^\/(?!api(\/|$)|health\/?$).*/, (req, res) => {
      if (req.path.startsWith('/r/') || req.path.startsWith('/u/')) res.set('Cache-Control', 'no-store'); // page de gestion : l'URL porte le token
      res.sendFile('index.html', { root: webDir });
    });
  }

  app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found', message: 'Route inconnue' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.code, message: err.message, ...(err.details && { details: err.details }) });
    }
    if (err.type === 'entity.parse.failed' || err.status === 400) {
      return res.status(400).json({ error: 'validation_error', message: 'Corps de requête invalide' });
    }
    if (err.status >= 400 && err.status < 500) {
      const codes = { 401: 'unauthenticated', 403: 'forbidden', 404: 'not_found', 429: 'rate_limited' };
      return res.status(err.status).json({ error: codes[err.status] ?? 'bad_request', message: err.expose ? err.message : 'Requête refusée' });
    }
    // Jamais l'objet erreur complet : une erreur pg embarque `detail`/`parameters` (valeurs saisies = données personnelles).
    req.log.error({ errName: err.name, errCode: err.code, errMessage: String(err.message).slice(0, 300), stack: err.stack }, 'erreur non gérée');
    res.status(500).json({ error: 'internal_error', message: 'Erreur interne' });
  });

  return app;
}

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import pino from 'pino';
import pinoHttp from 'pino-http';

const here = dirname(fileURLToPath(import.meta.url));
const { version } = JSON.parse(readFileSync(join(here, '../../package.json'), 'utf-8'));

export const REDACT_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'res.headers["set-cookie"]',
  'req.body.password',
];

export function createApp({ config, pool, logger, webDir = join(here, '../../dist/web') }) {
  const log = logger ?? pino({ level: config.nodeEnv === 'test' ? 'silent' : 'info', redact: REDACT_PATHS });
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(pinoHttp({ logger: log, redact: REDACT_PATHS, autoLogging: { ignore: (req) => req.url === '/health' } }));
  app.use(express.json({ limit: '100kb' }));

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
    app.get(/^\/(?!api\/|health$).*/, (_req, res) => res.sendFile(join(webDir, 'index.html')));
  }

  app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found', message: 'Route inconnue' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    if (err.type === 'entity.parse.failed' || err.status === 400) {
      return res.status(400).json({ error: 'validation_error', message: 'Corps de requête invalide' });
    }
    req.log.error({ err }, 'erreur non gérée');
    res.status(500).json({ error: 'internal_error', message: 'Erreur interne' });
  });

  return app;
}

// Support commun des tests d'integration LOT-2+ (pas de test ici). DATABASE_URL lue dans l'environnement ;
// base creee/migree par tests/server/global-setup.js (non duplique). Chaque fichier cree sa propre app
// (modules reinitialises => limiteurs de debit neufs) et vide les tables qu'il utilise.
import { vi, expect } from 'vitest';
import request from 'supertest';

export const hasDb = Boolean(process.env.DATABASE_URL);
export const SESSION_SECRET = 'test-secret-test-secret-test-secret-0123456789';
export const BASE_URL = 'http://localhost:3000';

export async function makeApp(options = {}) {
  process.env.NODE_ENV = 'test';
  process.env.SESSION_SECRET = SESSION_SECRET;
  process.env.APP_BASE_URL = BASE_URL;
  // Limite par IP+activité (anti-remplissage) relevée pour les tests qui inscrivent beaucoup depuis la même IP ;
  // le test dédié (creation/ratelimit-activite.test.js) la ramène à une valeur basse via options.env.
  process.env.RATE_LIMIT_REGISTRATION_PER_ACTIVITY_10MIN = '1000';
  Object.assign(process.env, options.env ?? {});
  const appOptions = { ...options };
  delete appOptions.env;
  vi.resetModules();
  const { createApp } = await import('../../../src/server/app.js');
  const app = createApp(appOptions);
  return { app, pool: app.locals.pool };
}

export async function closeApp({ pool }) {
  await pool?.end?.();
}

export async function resetData(pool) {
  await pool.query('TRUNCATE users CASCADE');
}

export async function createUser(pool, { email, password, name = 'Marie Test', role = 'manager' }) {
  const bcrypt = (await import('bcrypt')).default;
  const hash = await bcrypt.hash(password, 4); // cout bas : accelere les tests (verification independante du cout)
  const { rows } = await pool.query(
    'INSERT INTO users (email, password_hash, name, role) VALUES ($1,$2,$3,$4) RETURNING id',
    [email, hash, name, role],
  );
  return rows[0].id;
}

export function sidCookie(res) {
  const raw = [].concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('sid='));
  return raw ? raw.split(';')[0] : null;
}

export async function login(app, email, password) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  if (res.status !== 200) throw new Error(`login test impossible : ${res.status} ${JSON.stringify(res.body)}`);
  return sidCookie(res);
}

export function expectError(res, status, code) {
  expect(res.status).toBe(status);
  expect(res.body.error).toBe(code);
}

// 409 : le contrat liste `409 <sous-code>` ; accepte `error: <sous-code>` ou `error: conflict` + sous-code dans message.
export function expectConflict(res, subcode) {
  expect(res.status).toBe(409);
  const ok = res.body.error === subcode || (res.body.error === 'conflict' && String(res.body.message).includes(subcode));
  expect(ok, `409 attendu avec ${subcode}, recu ${JSON.stringify(res.body)}`).toBe(true);
}

export const validActivity = (over = {}) => ({
  title: 'Stage judo Toussaint',
  description: 'Apporter kimono et gourde.',
  starts_at: '2026-10-28T14:00:00.000Z',
  location: 'Dojo municipal',
  capacity: 20,
  ...over,
});

// Insere des inscriptions actives directement en base (l'API publique arrive au LOT-3). Colonnes : contracts/models.md.
export async function insertRegistrations(pool, activityId, n) {
  for (let i = 1; i <= n; i++) {
    await pool.query(
      `INSERT INTO registrations (activity_id, participant_name, is_minor, contact_name, contact_email, consent_at, consent_version, manage_token_hash)
       VALUES ($1, $2, false, $2, $3, now(), '2026-10', $4)`,
      [activityId, `Participant ${i}`, `p${i}@example.org`, `hash-${activityId}-${i}`],
    );
  }
}

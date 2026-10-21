import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

export const COOKIE_NAME = 'sid';
export const SESSION_DAYS = 7;
const BCRYPT_COST = 12;
// Hash factice : comparé quand l'e-mail est inconnu, pour que le temps de réponse ne révèle pas l'existence du compte.
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', BCRYPT_COST);

export const normalizeEmail = (email) => String(email).trim().toLowerCase();
export const hashPassword = (password) => bcrypt.hash(password, BCRYPT_COST);

export const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, role: u.role });

export function signSession(user, config) {
  return jwt.sign({ sub: user.id, role: user.role, tv: user.token_version ?? 0 }, config.sessionSecret, {
    algorithm: 'HS256',
    expiresIn: `${SESSION_DAYS}d`,
  });
}

/** Retourne le payload du JWT ou `null` (signature, algorithme ou expiration invalides). */
export function verifySession(token, config) {
  try {
    return jwt.verify(token, config.sessionSecret, { algorithms: ['HS256'] });
  } catch {
    return null;
  }
}

export function cookieOptions(config) {
  return { httpOnly: true, sameSite: 'lax', secure: config.https, path: '/', maxAge: SESSION_DAYS * 24 * 3600 * 1000 };
}

/** Vérifie e-mail + mot de passe ; retourne l'utilisateur (ligne complète) ou `null`. */
export async function authenticate(pool, email, password) {
  const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [normalizeEmail(email)]);
  const user = rows[0];
  const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
  return user && ok ? user : null;
}

export async function findUserById(pool, id) {
  const { rows } = await pool.query('SELECT id, email, name, role, token_version FROM users WHERE id = $1', [id]);
  return rows[0] ?? null;
}

/** Révoque toutes les sessions d'un utilisateur (les JWT émis avant portent un `tv` périmé). */
export async function revokeSessions(pool, userId) {
  await pool.query('UPDATE users SET token_version = token_version + 1 WHERE id = $1', [userId]);
}

/** Crée un compte ; retourne l'utilisateur public, ou `null` si l'e-mail existe déjà. */
export async function createUser(pool, { email, password, name, role = 'manager' }) {
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO NOTHING RETURNING id, email, name, role`,
    [normalizeEmail(email), await hashPassword(password), name, role],
  );
  return rows[0] ?? null;
}

/** Seed du compte initial depuis ADMIN_* : idempotent (rien si l'e-mail existe). Retourne true si créé. */
export async function seedAdmin(pool, config, log = console) {
  if (!config.admin) return false;
  const created = await createUser(pool, { ...config.admin, role: 'admin' });
  if (created) log.log?.('Compte administrateur initial créé.');
  return Boolean(created);
}

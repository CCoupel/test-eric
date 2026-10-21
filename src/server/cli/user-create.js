import { randomBytes } from 'node:crypto';
import { createUser } from '../services/auth.js';

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** `npm run user:create -- <email> <nom…>` : crée un responsable (rôle manager) avec un mot de passe généré. */
export async function runUserCreate(pool, args) {
  const [email, ...nameParts] = args;
  const name = nameParts.join(' ').trim();
  if (!email || !EMAIL.test(email) || !name) {
    throw new Error('Usage : npm run user:create -- <email> <nom>');
  }
  const password = randomBytes(15).toString('base64url');
  const user = await createUser(pool, { email, password, name, role: 'manager' });
  if (!user) throw new Error(`Un compte existe déjà pour ${email}.`);
  return { user, password };
}

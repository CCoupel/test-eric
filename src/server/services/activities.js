import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { conflict, notFound } from '../errors.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const UPDATABLE = ['title', 'description', 'starts_at', 'location', 'capacity'];
export const STATUSES = ['draft', 'open', 'closed'];

const title = z.string().trim().min(1, 'titre requis').max(120, '120 caractères maximum');
const description = z.string().trim().max(2000, '2000 caractères maximum').nullable();
const startsAt = z.iso.datetime({ offset: true, message: 'date ISO 8601 invalide' });
const location = z.string().trim().min(1, 'lieu requis').max(200, '200 caractères maximum');
const capacity = z.number('nombre entier attendu').int('nombre entier attendu').positive('doit être > 0').nullable();

export const createSchema = z.strictObject({
  title,
  description: description.optional(),
  starts_at: startsAt,
  location,
  capacity: capacity.optional(),
});
export const updateSchema = z
  .strictObject({ title, description, starts_at: startsAt, location, capacity })
  .partial()
  .refine((o) => Object.keys(o).length > 0, 'au moins un champ à modifier');
export const listQuerySchema = z.strictObject({ status: z.enum(STATUSES).optional() });

const SELECT = `SELECT a.*, u.name AS owner_name,
  (SELECT count(*)::int FROM registrations r WHERE r.activity_id = a.id) AS registrations_count
  FROM activities a JOIN users u ON u.id = a.owner_id`;

export function toActivity(row, config) {
  const count = row.registrations_count;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    starts_at: row.starts_at.toISOString(),
    location: row.location,
    capacity: row.capacity,
    status: row.status,
    public_slug: row.public_slug,
    public_url: `${config.baseUrl}/a/${row.public_slug}`,
    owner: { id: row.owner_id, name: row.owner_name },
    registrations_count: count,
    remaining_places: row.capacity === null ? null : row.capacity - count,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

export const generateSlug = () => Array.from({ length: 12 }, () => BASE62[randomInt(62)]).join('');

async function load(pool, id) {
  if (!UUID.test(id)) throw notFound('Activité');
  const { rows } = await pool.query(`${SELECT} WHERE a.id = $1`, [id]);
  if (!rows[0]) throw notFound('Activité');
  return rows[0];
}

export async function listActivities(pool, config, { status } = {}) {
  const { rows } = await pool.query(`${SELECT} WHERE ($1::text IS NULL OR a.status = $1) ORDER BY a.starts_at DESC, a.id`, [status ?? null]);
  return rows.map((r) => toActivity(r, config));
}

export async function getActivity(pool, config, id) {
  return toActivity(await load(pool, id), config);
}

export async function createActivity(pool, config, ownerId, input) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const { rows } = await pool.query(
        `INSERT INTO activities (title, description, starts_at, location, capacity, public_slug, owner_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [input.title, input.description ?? null, input.starts_at, input.location, input.capacity ?? null, generateSlug(), ownerId],
      );
      return getActivity(pool, config, rows[0].id);
    } catch (err) {
      if (err.code !== '23505' || attempt === 4) throw err; // collision de slug : on retente
    }
  }
}

export async function updateActivity(pool, config, id, patch) {
  const current = await load(pool, id);
  if (patch.capacity != null && patch.capacity < current.registrations_count) {
    throw conflict('capacity_below_registrations', 'La capacité est inférieure au nombre d’inscrits');
  }
  const keys = UPDATABLE.filter((k) => k in patch); // liste blanche : jamais de nom de colonne issu de la requête
  const sets = keys.map((k, i) => `${k} = $${i + 2}`);
  await pool.query(`UPDATE activities SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`, [id, ...keys.map((k) => patch[k])]);
  return getActivity(pool, config, id);
}

async function transition(pool, config, id, { from, to }) {
  await load(pool, id); // 404 si inconnue
  const { rowCount } = await pool.query(
    'UPDATE activities SET status = $2, updated_at = now() WHERE id = $1 AND status = ANY($3)',
    [id, to, from],
  );
  if (!rowCount) throw conflict('invalid_transition', `Transition vers « ${to} » impossible depuis cet état`);
  return getActivity(pool, config, id);
}

export const openActivity = (pool, config, id) => transition(pool, config, id, { from: ['draft', 'closed'], to: 'open' });
export const closeActivity = (pool, config, id) => transition(pool, config, id, { from: ['open'], to: 'closed' });

export async function deleteActivity(pool, id) {
  const current = await load(pool, id);
  if (current.status !== 'draft' && current.registrations_count > 0) {
    throw conflict('has_registrations', 'Des inscriptions actives existent');
  }
  await pool.query('DELETE FROM activities WHERE id = $1', [id]);
}

/** Inscriptions actives (triées par created_at croissant) + compteurs ; jamais de token ni de consentement. */
export async function listRegistrations(pool, config, id) {
  const a = toActivity(await load(pool, id), config);
  const { rows } = await pool.query(
    `SELECT id, participant_name, is_minor, contact_name, contact_email, created_at
     FROM registrations WHERE activity_id = $1 ORDER BY created_at, id`,
    [id],
  );
  const registrations = rows.map((r) => ({ ...r, created_at: r.created_at.toISOString() }));
  return { registrations, count: a.registrations_count, capacity: a.capacity, remaining_places: a.remaining_places };
}

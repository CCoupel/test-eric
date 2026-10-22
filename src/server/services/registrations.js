import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { consentText } from '../consent.js';
import { withTx } from '../db/tx.js';
import { conflict, notFound } from '../errors.js';
import { lockActivity } from './activities.js';

export const SLUG_RE = /^[0-9A-Za-z]{12}$/;
export const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/; // 32 octets en base64url
const FORBIDDEN_CHARS = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u; // contrôle, zéro-largeur, bidi, séparateurs de ligne

const cleanName = (max) =>
  z
    .string('texte attendu')
    .transform((v) => v.normalize('NFC').replace(/\s+/g, ' ').trim())
    .pipe(
      z
        .string()
        .min(1, 'requis')
        .max(max, `${max} caractères maximum`)
        .refine((v) => !FORBIDDEN_CHARS.test(v), 'caractères non autorisés'),
    );

const email = z
  .string('texte attendu')
  .trim()
  .toLowerCase()
  .max(254, '254 caractères maximum')
  .pipe(z.email('adresse e-mail invalide'));

/**
 * `hp_extra` = honeypot (champ masqué du formulaire, nom volontairement opaque) : un humain le laisse vide.
 * `website` = ancien nom du honeypot, désormais TOLÉRÉ ET IGNORÉ : le navigateur le remplissait par saisie automatique
 * (nom/libellé « site web »), ce qui transformait de vraies inscriptions en faux succès.
 */
export const createRegistrationSchema = z
  .strictObject({
    participant_name: cleanName(120),
    is_minor: z.boolean('booléen attendu'),
    contact_name: cleanName(120).optional(),
    contact_email: email,
    consent: z.literal(true, 'le consentement est obligatoire'),
    hp_extra: z.string().max(200).optional(),
    website: z.string().max(200).optional(), // déprécié, ignoré
  })
  .superRefine((v, ctx) => {
    if (v.is_minor && !v.contact_name) ctx.addIssue({ code: 'custom', path: ['contact_name'], message: 'requis pour un mineur (parent / tuteur)' });
  });

export const hashToken = (token) => createHash('sha256').update(token).digest('hex');
export const newToken = () => randomBytes(32).toString('base64url');

const publicRegistration = (r) => ({
  id: r.id,
  participant_name: r.participant_name,
  is_minor: r.is_minor,
  contact_name: r.contact_name,
  contact_email: r.contact_email,
  created_at: r.created_at.toISOString(),
});

/** Fiche publique : liste blanche stricte, aucun identifiant interne. 404 si slug inconnu ou brouillon. */
export async function findPublicActivity(pool, slug) {
  if (!SLUG_RE.test(slug)) throw notFound('Activité');
  const { rows } = await pool.query(
    `SELECT a.title, a.description, a.starts_at, a.location, a.status, a.capacity,
            (SELECT count(*)::int FROM registrations r WHERE r.activity_id = a.id) AS taken
     FROM activities a WHERE a.public_slug = $1 AND a.status <> 'draft'`,
    [slug],
  );
  if (!rows[0]) throw notFound('Activité');
  return rows[0];
}

export function toPublicActivity(row, config) {
  const remaining = row.capacity === null ? null : Math.max(row.capacity - row.taken, 0);
  return {
    activity: {
      title: row.title,
      description: row.description,
      starts_at: row.starts_at.toISOString(),
      location: row.location,
      status: row.status,
      capacity: row.capacity,
      remaining_places: remaining,
      is_full: remaining === 0,
    },
    consent_text: consentText(config),
    consent_version: config.consentTextVersion,
  };
}

/**
 * Création transactionnelle : verrou `FOR UPDATE` sur l'activité (sérialise les inscriptions concurrentes),
 * puis statut → doublon → capacité → INSERT. Le token n'est jamais stocké en clair.
 */
export async function createRegistration(pool, config, slug, input, log) {
  const token = newToken();
  const contactName = input.is_minor ? input.contact_name : input.participant_name;
  const row = await withTx(pool, async (db) => {
    const act = (
      await db.query(
        `SELECT id, status, capacity, starts_at <= now() AS started
         FROM activities WHERE public_slug = $1 AND status <> 'draft' FOR UPDATE`,
        [slug],
      )
    ).rows[0];
    if (!act) throw notFound('Activité');
    // Activité commencée ou passée : plus d'inscription (sous-code contractuel existant `activity_closed`). Évite aussi qu'une
    // inscription tardive soit purgée aussitôt par la rétention.
    if (act.status !== 'open' || act.started) throw conflict('activity_closed', 'Les inscriptions sont fermées');
    const dup = await db.query(
      'SELECT 1 FROM registrations WHERE activity_id = $1 AND contact_email = $2 AND lower(participant_name) = lower($3)',
      [act.id, input.contact_email, input.participant_name],
    );
    if (dup.rowCount) throw conflict('already_registered', 'Cette personne est déjà inscrite');
    if (act.capacity !== null) {
      const { rows } = await db.query('SELECT count(*)::int AS n FROM registrations WHERE activity_id = $1', [act.id]);
      if (rows[0].n >= act.capacity) throw conflict('activity_full', 'L’activité est complète');
    }
    try {
      const ins = await db.query(
        `INSERT INTO registrations (activity_id, participant_name, is_minor, contact_name, contact_email, consent_at, consent_version, manage_token_hash)
         VALUES ($1, $2, $3, $4, $5, now(), $6, $7)
         RETURNING id, participant_name, is_minor, contact_name, contact_email, created_at`,
        [act.id, input.participant_name, input.is_minor, contactName, input.contact_email, config.consentTextVersion, hashToken(token)],
      );
      return { ...ins.rows[0], activity_id: act.id };
    } catch (err) {
      if (err.code === '23505') throw conflict('already_registered', 'Cette personne est déjà inscrite');
      throw err;
    }
  });
  log?.info({ event: 'registration_created', activityId: row.activity_id, isMinor: row.is_minor }, 'inscription');
  return { registration: publicRegistration(row), manage_url: `${config.baseUrl}/r/${token}` };
}

/** Fausse réponse de succès pour un robot (honeypot) : rien n'est enregistré. */
export function fakeRegistration(config, input) {
  return {
    registration: {
      id: randomUUID(),
      participant_name: input.participant_name,
      is_minor: input.is_minor,
      contact_name: input.is_minor ? (input.contact_name ?? '') : input.participant_name,
      contact_email: input.contact_email,
      created_at: new Date().toISOString(),
    },
    manage_url: `${config.baseUrl}/r/${newToken()}`,
  };
}

/** Résumé d'une inscription par son token. 404 identique pour token invalide / inconnu / supprimé. */
export async function getByToken(pool, config, token) {
  if (!TOKEN_RE.test(token)) throw notFound('Inscription');
  const { rows } = await pool.query(
    `SELECT r.id, r.participant_name, r.is_minor, r.contact_name, r.contact_email, r.created_at,
            a.title, a.starts_at, a.location, a.status, a.public_slug
     FROM registrations r JOIN activities a ON a.id = r.activity_id WHERE r.manage_token_hash = $1`,
    [hashToken(token)],
  );
  const r = rows[0];
  if (!r) throw notFound('Inscription');
  return {
    registration: publicRegistration(r),
    activity: {
      title: r.title,
      starts_at: r.starts_at.toISOString(),
      location: r.location,
      status: r.status,
      public_url: `${config.baseUrl}/a/${r.public_slug}`,
    },
  };
}

/**
 * Anonymise l'historique d'envois lié à des inscriptions (à appeler DANS la transaction de suppression, AVANT le DELETE :
 * la FK `ON DELETE SET NULL` effacerait sinon le lien). Efface aussi `error` (les erreurs SMTP contiennent l'adresse).
 */
export async function anonymizeRecipients(db, registrationIds) {
  if (!registrationIds.length) return 0;
  // Un destinataire = une adresse : effacé seulement si AUCUNE autre inscription de cette adresse ne subsiste dans les activités de l'envoi
  // (supprimer un seul enfant ne doit pas invalider le lien de désabonnement du parent). Les lignes encore valides perdent leur lien
  // `registration_id` (FK SET NULL) mais gardent l'adresse ; elles seront effacées avec la dernière inscription de l'adresse.
  const r = await db.query(
    `UPDATE mailing_recipients mr
        SET email = NULL, error = NULL, unsubscribe_token_hash = NULL, registration_id = NULL
      WHERE (mr.registration_id = ANY($1) OR mr.email IN (SELECT contact_email FROM registrations WHERE id = ANY($1)))
        AND NOT EXISTS (
          SELECT 1 FROM registrations r2 JOIN mailing_activities ma ON ma.activity_id = r2.activity_id
           WHERE ma.mailing_id = mr.mailing_id AND r2.contact_email = mr.email AND NOT (r2.id = ANY($1)))`,
    [registrationIds],
  );
  return r.rowCount;
}

/** Désinscription : suppression physique + anonymisation en une transaction. */
export async function deleteByToken(pool, token, log) {
  if (!TOKEN_RE.test(token)) throw notFound('Inscription');
  const activityId = await withTx(pool, async (db) => {
    const found = (await db.query('SELECT id, activity_id FROM registrations WHERE manage_token_hash = $1 FOR UPDATE', [hashToken(token)])).rows[0];
    if (!found) throw notFound('Inscription');
    await anonymizeRecipients(db, [found.id]);
    await db.query('DELETE FROM registrations WHERE id = $1', [found.id]);
    return found.activity_id;
  });
  log?.info({ event: 'registration_deleted', activityId }, 'désinscription');
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Suppression d'une inscription par un responsable (exercice des droits : lien perdu, demande par e-mail) :
 * même suppression physique + anonymisation transactionnelle que la désinscription publique.
 * 404 si l'activité n'existe pas ou si l'inscription n'appartient pas à cette activité.
 */
export async function removeRegistrationAsManager(pool, activityId, registrationId) {
  await withTx(pool, async (db) => {
    await lockActivity(db, activityId); // 404 si activité inconnue ; sérialise avec les inscriptions
    if (!UUID.test(registrationId)) throw notFound('Inscription');
    const found = (await db.query('SELECT id FROM registrations WHERE id = $1 AND activity_id = $2 FOR UPDATE', [registrationId, activityId])).rows[0];
    if (!found) throw notFound('Inscription');
    await anonymizeRecipients(db, [found.id]);
    await db.query('DELETE FROM registrations WHERE id = $1', [found.id]);
  });
}

const PURGE_BATCH = 500;

/**
 * Purge RGPD : inscriptions des activités terminées depuis plus de `retentionMonths` mois, puis historique d'envois
 * (`mailings` et, en cascade, `mailing_activities` / `mailing_recipients`) plus vieux que la rétention. Idempotent, par lots de 500.
 */
export async function purgeExpired(pool, { retentionMonths }) {
  const total = { registrationsDeleted: 0, recipientsAnonymized: 0, mailingsDeleted: 0 };
  for (;;) {
    const batch = await withTx(pool, async (db) => {
      const { rows } = await db.query(
        `SELECT r.id FROM registrations r JOIN activities a ON a.id = r.activity_id
         WHERE a.starts_at < now() - make_interval(months => $1) ORDER BY r.id LIMIT $2 FOR UPDATE OF r`,
        [retentionMonths, PURGE_BATCH],
      );
      const ids = rows.map((r) => r.id);
      const anonymized = await anonymizeRecipients(db, ids);
      if (ids.length) await db.query('DELETE FROM registrations WHERE id = ANY($1)', [ids]);
      return { count: ids.length, anonymized };
    });
    total.registrationsDeleted += batch.count;
    total.recipientsAnonymized += batch.anonymized;
    if (batch.count < PURGE_BATCH) break;
  }
  for (;;) {
    const r = await pool.query(
      `DELETE FROM mailings WHERE id IN (
         SELECT id FROM mailings WHERE created_at < now() - make_interval(months => $1) ORDER BY id LIMIT $2)`,
      [retentionMonths, PURGE_BATCH],
    );
    total.mailingsDeleted += r.rowCount;
    if (r.rowCount < PURGE_BATCH) break;
  }
  return total;
}

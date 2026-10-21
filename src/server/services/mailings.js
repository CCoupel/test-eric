import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { withTx } from '../db/tx.js';
import { conflict, notFound } from '../errors.js';
import { bulkMessage, isSafeSubject, normalizeNewlines } from '../mailer/render.js';
import { hashToken } from './registrations.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOCK_KEY = 726_002; // verrou consultatif : un seul envoi groupé à la fois
const DUPLICATE_WINDOW = "interval '5 minutes'";

const activityIds = z
  .array(z.string('UUID attendu').regex(UUID, 'UUID attendu'), 'liste attendue')
  .min(1, 'au moins une activité')
  .max(20, '20 activités maximum')
  .refine((a) => new Set(a.map((x) => x.toLowerCase())).size === a.length, 'activités en double');

export const createSchema = z.strictObject({
  activity_ids: activityIds,
  subject: z
    .string('texte attendu')
    .trim()
    .min(1, 'sujet requis')
    .max(200, '200 caractères maximum')
    .refine(isSafeSubject, 'caractères de contrôle interdits'),
  body: z
    .string('texte attendu')
    .transform(normalizeNewlines)
    .pipe(
      z
        .string()
        .refine((v) => v.trim().length > 0, 'message requis')
        .max(20_000, '20 000 caractères maximum')
        .refine((v) => !/\p{Cc}/u.test(v.replace(/[\n\t]/g, '')), 'caractères de contrôle interdits'),
    ),
});

export const previewQuerySchema = z.strictObject({
  activity_ids: z
    .string('liste attendue')
    .transform((s) => s.split(',').map((x) => x.trim()))
    .pipe(activityIds),
});

const sha = (s) => createHash('sha256').update(s).digest('hex');

/** Contrôle l'existence des activités (404 sinon) et retourne leurs titres. */
async function loadActivities(db, ids) {
  const { rows } = await db.query('SELECT id, title FROM activities WHERE id = ANY($1::uuid[]) ORDER BY title, id', [ids]);
  if (rows.length !== ids.length) throw notFound('Activité');
  return rows;
}

/** Destinataires dédoublonnés par e-mail (une seule ligne par adresse, titres des activités concernées). */
async function loadRecipients(db, ids) {
  const { rows } = await db.query(
    `SELECT r.contact_email AS email, (array_agg(r.id ORDER BY r.created_at))[1] AS registration_id,
            array_agg(DISTINCT a.title ORDER BY a.title) AS titles
     FROM registrations r JOIN activities a ON a.id = r.activity_id
     WHERE r.activity_id = ANY($1::uuid[]) GROUP BY r.contact_email ORDER BY r.contact_email`,
    [ids],
  );
  return rows;
}

/** Aperçu : uniquement des compteurs (aucune adresse). */
export async function previewRecipients(pool, ids) {
  const acts = await loadActivities(pool, ids);
  const recipients = await loadRecipients(pool, ids);
  const { rows } = await pool.query(
    'SELECT activity_id, count(DISTINCT contact_email)::int AS n FROM registrations WHERE activity_id = ANY($1::uuid[]) GROUP BY activity_id',
    [ids],
  );
  const per = new Map(rows.map((r) => [r.activity_id, r.n]));
  return { recipients_count: recipients.length, by_activity: acts.map((a) => ({ id: a.id, title: a.title, count: per.get(a.id) ?? 0 })) };
}

const toMailing = (m, activities, sender) => ({
  id: m.id,
  subject: m.subject,
  ...(m.body !== undefined && { body: m.body }),
  status: m.status,
  transport: m.transport,
  sender: { id: m.sender_id, name: sender ?? m.sender_name },
  activities: activities ?? m.activities ?? [],
  recipients_count: m.recipients_count,
  sent_count: m.sent_count,
  failed_count: m.failed_count,
  created_at: m.created_at.toISOString(),
  completed_at: m.completed_at ? m.completed_at.toISOString() : null,
});

const MAILING_SELECT = `SELECT m.*, u.name AS sender_name,
  COALESCE((SELECT json_agg(json_build_object('id', a.id, 'title', a.title) ORDER BY a.title)
            FROM mailing_activities ma JOIN activities a ON a.id = ma.activity_id WHERE ma.mailing_id = m.id), '[]') AS activities
  FROM mailings m JOIN users u ON u.id = m.sender_id`;

export async function listMailings(pool) {
  const { rows } = await pool.query(`${MAILING_SELECT} ORDER BY m.created_at DESC, m.id`);
  return rows.map((m) => {
    const mailing = toMailing(m);
    delete mailing.body; // la liste n'expose pas les corps
    return mailing;
  });
}

export async function getMailing(pool, id) {
  if (!UUID.test(id)) throw notFound('Envoi');
  const { rows } = await pool.query(`${MAILING_SELECT} WHERE m.id = $1`, [id]);
  if (!rows[0]) throw notFound('Envoi');
  const rc = await pool.query('SELECT email, status, error, sent_at FROM mailing_recipients WHERE mailing_id = $1 ORDER BY sent_at NULLS LAST, id', [id]);
  return {
    mailing: toMailing(rows[0]),
    recipients: rc.rows.map((r) => ({ email: r.email, status: r.status, error: r.error, sent_at: r.sent_at ? r.sent_at.toISOString() : null })),
  };
}

/** Service d'envoi : verrou global, anti double-envoi, boucle séquentielle détachée de la requête HTTP. */
export function createMailingService({ pool, config, mailer }) {
  const inFlight = new Set();

  async function sendLoop({ mailingId, userId, recipients, subject, body, log }) {
    let sent = 0;
    let failed = 0;
    try {
      for (const r of recipients) {
        const token = randomBytes(32).toString('base64url');
        // Ligne écrite AVANT l'envoi (lien de désabonnement valide dès l'envoi ; « failed/interrupted » si le processus s'arrête en cours).
        const ins = await pool.query(
          `INSERT INTO mailing_recipients (mailing_id, registration_id, email, status, error, unsubscribe_token_hash)
           VALUES ($1, $2, $3, 'failed', 'interrupted', $4) RETURNING id`,
          [mailingId, r.registration_id, r.email, hashToken(token)],
        );
        const message = bulkMessage({
          config,
          subject,
          body,
          activityTitles: r.titles,
          unsubscribeUrl: `${config.baseUrl}/api/public/unsubscribe/${token}`,
          unsubscribePageUrl: `${config.baseUrl}/u/${token}`,
        });
        let status = mailer.transport === 'stub' ? 'stubbed' : 'sent';
        let error = null;
        try {
          await mailer.send({ to: r.email, ...message });
          sent += 1;
        } catch (err) {
          status = 'failed';
          error = err.code ?? 'other';
          failed += 1;
        }
        await pool.query('UPDATE mailing_recipients SET status = $2, error = $3, sent_at = now() WHERE id = $1', [ins.rows[0].id, status, error]);
      }
    } catch (err) {
      log?.error?.({ event: 'mailing_loop_error', mailingId, code: err.code, message: String(err.message).slice(0, 200) }, 'envoi interrompu');
      failed = recipients.length - sent;
    } finally {
      const status = failed === 0 ? 'sent' : sent === 0 ? 'failed' : 'partial';
      await pool
        .query('UPDATE mailings SET status = $2, sent_count = $3, failed_count = $4, completed_at = now() WHERE id = $1', [mailingId, status, sent, failed])
        .catch((err) => log?.error?.({ event: 'mailing_finalize_error', mailingId, code: err.code }, 'statut non finalisé'));
    }
    log?.info?.({ event: 'mailing_sent', userId, mailingId, recipients: recipients.length, sent, failed }, 'envoi groupé terminé');
  }

  return {
    /** Crée l'envoi (transaction + verrou) puis lance la boucle ; ≤ syncMax destinataires : attend la fin (201), sinon 202. */
    async create(user, input, log) {
      const ids = input.activity_ids.map((x) => x.toLowerCase());
      const fingerprint = sha(JSON.stringify([[...ids].sort(), input.subject, input.body]));
      const { mailing, recipients } = await withTx(pool, async (db) => {
        await db.query('SELECT pg_advisory_xact_lock($1)', [LOCK_KEY]);
        await loadActivities(db, ids);
        const recipients = await loadRecipients(db, ids);
        if (recipients.length === 0) throw conflict('no_recipients', 'Aucun destinataire pour ces activités');
        if (recipients.length > config.mailLimits.maxRecipients) {
          throw conflict('too_many_recipients', `Plus de ${config.mailLimits.maxRecipients} destinataires : réduisez la sélection`);
        }
        if ((await db.query("SELECT 1 FROM mailings WHERE status = 'sending'")).rowCount) {
          throw conflict('mailing_in_progress', 'Un envoi est déjà en cours');
        }
        const dup = await db.query(
          `SELECT 1 FROM mailings WHERE sender_id = $1 AND fingerprint = $2 AND created_at > now() - ${DUPLICATE_WINDOW}`,
          [user.id, fingerprint],
        );
        if (dup.rowCount) throw conflict('duplicate_mailing', 'Un envoi identique vient d’être effectué');
        const ins = await db.query(
          `INSERT INTO mailings (subject, body, sender_id, status, recipients_count, transport, fingerprint)
           VALUES ($1, $2, $3, 'sending', $4, $5, $6) RETURNING id`,
          [input.subject, input.body, user.id, recipients.length, mailer.transport, fingerprint],
        );
        for (const id of ids) await db.query('INSERT INTO mailing_activities (mailing_id, activity_id) VALUES ($1, $2)', [ins.rows[0].id, id]);
        return { mailing: ins.rows[0], recipients };
      });

      // Boucle détachée de la requête : se termine et finalise le statut même si le client se déconnecte.
      const task = sendLoop({ mailingId: mailing.id, userId: user.id, recipients, subject: input.subject, body: input.body, log });
      inFlight.add(task);
      task.finally(() => inFlight.delete(task));
      const background = recipients.length > config.mailLimits.syncMaxRecipients;
      if (!background) await task;
      const { mailing: result } = await getMailing(pool, mailing.id);
      return { mailing: result, background };
    },

    /** Au démarrage : tout envoi resté `sending` (crash, SIGTERM) est clos, jamais repris (risque de doublons). */
    async recoverOrphans() {
      await pool.query(`
        UPDATE mailings m SET completed_at = now(),
          sent_count = c.sent, failed_count = m.recipients_count - c.sent,
          status = CASE WHEN c.sent = 0 THEN 'failed' ELSE 'partial' END
        FROM (SELECT m2.id, (SELECT count(*)::int FROM mailing_recipients r WHERE r.mailing_id = m2.id AND r.status IN ('sent','stubbed')) AS sent
              FROM mailings m2 WHERE m2.status = 'sending') c
        WHERE m.id = c.id`);
    },

    /** Attend la fin des envois en cours (arrêt propre). */
    async drain() {
      await Promise.allSettled([...inFlight]);
    },
  };
}

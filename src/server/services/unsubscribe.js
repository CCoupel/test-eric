import { withTx } from '../db/tx.js';
import { notFound } from '../errors.js';
import { TOKEN_RE, anonymizeRecipients, hashToken } from './registrations.js';

/** Activités concernées par un lien de désabonnement (non mutant, pour la page de confirmation). 404 uniforme. */
export async function describeUnsubscribe(pool, token) {
  if (!TOKEN_RE.test(token)) throw notFound('Lien');
  const { rows } = await pool.query(
    `SELECT a.title, a.starts_at
     FROM mailing_recipients mr
     JOIN mailing_activities ma ON ma.mailing_id = mr.mailing_id
     JOIN activities a ON a.id = ma.activity_id
     WHERE mr.unsubscribe_token_hash = $1 AND mr.email IS NOT NULL
       AND EXISTS (SELECT 1 FROM registrations g WHERE g.activity_id = a.id AND g.contact_email = mr.email)
     ORDER BY a.starts_at, a.title`,
    [hashToken(token)],
  );
  if (!rows.length) throw notFound('Lien');
  return { activities: rows.map((r) => ({ title: r.title, starts_at: r.starts_at.toISOString() })) };
}

/**
 * Désabonnement = désinscription des activités de cet envoi (même suppression physique + anonymisation que /r/:token).
 * Toutes les inscriptions faites avec cette adresse dans ces activités sont retirées (un seul e-mail par destinataire).
 * Le token est à usage unique : invalidé dans la même transaction.
 */
export async function unsubscribe(pool, token, log) {
  if (!TOKEN_RE.test(token)) throw notFound('Lien');
  const count = await withTx(pool, async (db) => {
    const rcpt = (
      await db.query('SELECT id, mailing_id, email FROM mailing_recipients WHERE unsubscribe_token_hash = $1 AND email IS NOT NULL FOR UPDATE', [hashToken(token)])
    ).rows[0];
    if (!rcpt) throw notFound('Lien');
    const regs = (
      await db.query(
        `SELECT r.id FROM registrations r WHERE r.contact_email = $1
           AND r.activity_id IN (SELECT activity_id FROM mailing_activities WHERE mailing_id = $2) FOR UPDATE`,
        [rcpt.email, rcpt.mailing_id],
      )
    ).rows.map((r) => r.id);
    await anonymizeRecipients(db, regs);
    if (regs.length) await db.query('DELETE FROM registrations WHERE id = ANY($1)', [regs]);
    await db.query('UPDATE mailing_recipients SET email = NULL, error = NULL, unsubscribe_token_hash = NULL, registration_id = NULL WHERE id = $1', [rcpt.id]);
    return regs.length;
  });
  log?.info({ event: 'unsubscribed', registrations: count }, 'désabonnement');
}

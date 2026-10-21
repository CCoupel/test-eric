// Support LOT-4 (envois groupes) : faux mailer injectable, inscriptions de test, capture de logs. Pas de test ici.
import { Writable } from 'node:stream';
import pino from 'pino';
import { register } from './inscription.js';

export function fakeMailer({ transport = 'smtp', failFor = [], gate } = {}) {
  const sent = [];
  return {
    transport,
    from: 'Club <no-reply@club.example>',
    sent,
    async send(message) {
      if (gate) await gate;
      sent.push(message);
      if (failFor.includes(message.to)) throw Object.assign(new Error('mail_failed'), { code: 'rejected' });
    },
    bulk: () => sent.filter((m) => m.headers?.['List-Unsubscribe']),
    confirmations: () => sent.filter((m) => /^Inscription enregistrée/.test(m.subject)),
  };
}

export function captureLogs() {
  const lines = [];
  const stream = new Writable({ write(chunk, _enc, cb) { lines.push(String(chunk)); cb(); } });
  return { logger: pino({ level: 'info' }, stream), text: () => lines.join('') };
}

/** Inscrit n participants (adresses distinctes `pN@mail.fr`) a une activite ouverte. */
export async function registerMany(ctx, activity, n, prefix = 'p') {
  for (let i = 1; i <= n; i++) {
    const res = await register(ctx, activity.public_slug, { participant_name: `Enfant ${prefix}${i}`, contact_name: `Parent ${prefix}${i}`, contact_email: `${prefix}${i}@mail.fr` });
    if (res.status !== 201) throw new Error(`inscription de test impossible : ${res.status}`);
  }
}

export const mailingBody = (activityIds, over = {}) => ({ activity_ids: activityIds, subject: 'Sortie de samedi', body: 'Bonjour,\nRendez-vous 9 h.\n\nA samedi', ...over });

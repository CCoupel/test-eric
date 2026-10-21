import nodemailer from 'nodemailer';
import { isSingleAddress } from '../address.js';

// Destinataire = UNE adresse simple (voir address.js) : Nodemailer interprèterait sinon les listes et les retours à la ligne.
export { isSingleAddress };

/** Code grossier d'une erreur de transport : jamais l'adresse, l'hôte ni la réponse SMTP (ce champ est montré aux responsables). */
export function classifyMailError(err) {
  const code = String(err?.code ?? '');
  if (['ETIMEDOUT', 'ESOCKET', 'ETIMEOUT'].includes(code) || /timed? ?out/i.test(String(err?.message))) return 'timeout';
  if (['ECONNECTION', 'ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EDNS'].includes(code)) return 'connection';
  if (code === 'EAUTH') return 'auth';
  if (code === 'EENVELOPE' || (err?.responseCode >= 500 && err?.responseCode < 600)) return 'rejected';
  return 'other';
}

function smtpTransport(mail) {
  const transporter = nodemailer.createTransport({
    host: mail.host,
    port: mail.port,
    secure: mail.secure,
    ...(mail.user && { auth: { user: mail.user, pass: mail.pass } }),
    requireTLS: Boolean(mail.user) || mail.requireTls, // jamais d'identifiants en clair ; TLS imposé hors hôte local (SMTP_REQUIRE_TLS)
    tls: { rejectUnauthorized: true },
    pool: false,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 10_000,
    disableFileAccess: true, // aucune pièce jointe / contenu lu depuis le disque
    disableUrlAccess: true, // ni depuis une URL
  });
  return async ({ to, subject, text, html, headers }) => {
    await transporter.sendMail({ from: mail.from, to, subject, text, html, headers });
  };
}

/**
 * Transport de messagerie. `send({to, subject, text, html, headers})` → résout ou rejette avec une erreur dont `code` est grossier
 * (`timeout|connection|auth|rejected|other`). `stub` : n'envoie rien, ne journalise ni adresse ni contenu.
 */
export function createMailer(config, log) {
  const mail = config.mail;
  if (mail.transport === 'smtp') {
    const sendSmtp = smtpTransport(mail);
    return {
      transport: 'smtp',
      from: mail.from,
      async send(message) {
        if (!isSingleAddress(message.to)) throw Object.assign(new Error('mail_failed'), { code: 'rejected' });
        try {
          await sendSmtp(message);
        } catch (err) {
          throw Object.assign(new Error('mail_failed'), { code: classifyMailError(err) });
        }
      },
    };
  }
  return {
    transport: 'stub',
    from: mail.from,
    async send(message) {
      if (!isSingleAddress(message.to)) throw Object.assign(new Error('mail_failed'), { code: 'rejected' });
      log?.info?.({ event: 'mail_stubbed', subject: String(message.subject).slice(0, 40) }, 'e-mail non envoyé (transport stub)');
    },
  };
}

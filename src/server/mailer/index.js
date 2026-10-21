import nodemailer from 'nodemailer';

// Destinataire = UNE adresse simple. Nodemailer interprète les listes (« a@x, b@y ») et les retours à la ligne : refusés ici (défense en profondeur ;
// les adresses viennent déjà de la base, validées à l'inscription).
const SINGLE_ADDRESS = /^[^\s<>,;"()[\]\\@]+@[^\s<>,;"()[\]\\@]+\.[^\s<>,;"()[\]\\@]+$/;
export const isSingleAddress = (to) => typeof to === 'string' && to.length <= 254 && SINGLE_ADDRESS.test(to);

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
    requireTLS: Boolean(mail.user), // jamais d'identifiants en clair
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

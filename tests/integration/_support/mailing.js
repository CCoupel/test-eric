// Support LOT-4 : serveur SMTP de test en process (smtp-server), lecture des messages, envois et jeux de donnees (pas de test ici).
import http from 'node:http';
import { SMTPServer } from 'smtp-server';
import { setup, newActivity } from './inscription.js';

export const MAIL_FROM = 'Club Test <no-reply@club.test>';
export const CONTACT = 'contact@club.test';
export const SENTINELLE_PASS = 'smtp-pass-sentinelle-9f3a';

let seq = 0;
export const uniq = (prefix = 'Sujet') => `${prefix} ${Date.now()}-${++seq}`;

/** Environnement de base : limites relevees pour ne pas gener les tests qui n'en parlent pas. */
export const mailEnv = (extra = {}) => ({
  RATE_LIMIT_MAILING_PER_USER_10MIN: '1000',
  MAILING_MAX_RECIPIENTS: '500',
  MAILING_SYNC_MAX_RECIPIENTS: '100',
  CONTACT_EMAIL: CONTACT,
  ...extra,
});

export const smtpEnv = (port, extra = {}) => mailEnv({ SMTP_HOST: '127.0.0.1', SMTP_PORT: String(port), SMTP_SECURE: 'false', MAIL_FROM, ...extra });

/** Serveur SMTP local sans TLS ni auth. `rejectRcpt` : adresses refusees (550) ; `delayMs` : latence avant acceptation du message. */
export async function startSmtp({ rejectRcpt = [], delayMs = 0 } = {}) {
  const messages = [];
  const refus = rejectRcpt.map((a) => a.toLowerCase());
  const server = new SMTPServer({
    logger: false,
    authOptional: true,
    disabledCommands: ['AUTH', 'STARTTLS'],
    onRcptTo(address, _session, cb) {
      if (refus.includes(address.address.toLowerCase())) return cb(Object.assign(new Error('550 5.1.1 mailbox unavailable'), { responseCode: 550 }));
      return cb();
    },
    onData(stream, session, cb) {
      const chunks = [];
      stream.on('data', (c) => chunks.push(c));
      stream.on('end', () => {
        messages.push({
          raw: Buffer.concat(chunks).toString('utf-8'),
          from: session.envelope.mailFrom.address,
          rcpt: session.envelope.rcptTo.map((r) => r.address),
        });
        setTimeout(cb, delayMs);
      });
    },
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { port: server.server.address().port, messages, close: () => new Promise((r) => server.close(r)) };
}

/** Port ferme (connexion refusee) : ouvre puis ferme un serveur pour obtenir un port libre. */
export async function closedPort() {
  const s = http.createServer();
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  const { port } = s.address();
  await new Promise((r) => s.close(r));
  return port;
}

function decodeQP(s) {
  return s.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}
function decodePart(body, encoding) {
  const e = (encoding ?? '').toLowerCase();
  if (e === 'base64') return Buffer.from(body.replace(/\s+/g, ''), 'base64').toString('utf-8');
  if (e === 'quoted-printable') return Buffer.from(decodeQP(body), 'latin1').toString('utf-8');
  return body;
}
function parseHeaders(block) {
  const headers = {};
  const unfolded = block.replace(/\r?\n[ \t]+/g, ' ');
  for (const line of unfolded.split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i < 1) continue;
    (headers[line.slice(0, i).toLowerCase()] ??= []).push(line.slice(i + 1).trim());
  }
  return headers;
}

/** Analyse minimale d'un message MIME : en-tetes de tete (liste par nom) + parties text/plain et text/html decodees. */
export function parseMessage(raw) {
  const cut = raw.search(/\r?\n\r?\n/);
  const head = raw.slice(0, cut);
  const rest = raw.slice(cut).replace(/^\r?\n\r?\n/, '');
  const headers = parseHeaders(head);
  const out = { headers, text: '', html: '', head, rest };
  const ct = headers['content-type']?.[0] ?? 'text/plain';
  const boundary = ct.match(/boundary="?([^";]+)"?/i)?.[1];
  const parts = boundary ? rest.split(`--${boundary}`).slice(1, -1) : [`${head}\r\n\r\n${rest}`];
  for (const p of parts) {
    const c = p.search(/\r?\n\r?\n/);
    const h = parseHeaders(p.slice(0, c).replace(/^\r?\n/, ''));
    const body = decodePart(p.slice(c).replace(/^\r?\n\r?\n/, ''), h['content-transfer-encoding']?.[0] ?? headers['content-transfer-encoding']?.[0]);
    const type = (h['content-type']?.[0] ?? ct).toLowerCase();
    if (type.startsWith('text/html')) out.html += body;
    else if (type.startsWith('text/plain')) out.text += body;
    else if (type.startsWith('multipart/')) {
      const nested = parseMessage(`${p.slice(0, c).replace(/^\r?\n/, '')}\r\n\r\n${p.slice(c).replace(/^\r?\n\r?\n/, '')}`);
      out.text += nested.text;
      out.html += nested.html;
    }
  }
  return out;
}

export async function waitFor(fn, { timeout = 8000, step = 50 } = {}) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > timeout) throw new Error('waitFor : delai depasse');
    await new Promise((r) => setTimeout(r, step));
  }
}

/** Inscriptions actives inserees en SQL (l'API publique est limitee par IP) — un e-mail = une inscription. */
export async function addRegs(pool, activityId, emails) {
  const ids = [];
  for (const [i, email] of emails.entries()) {
    const { rows } = await pool.query(
      `INSERT INTO registrations (activity_id, participant_name, is_minor, contact_name, contact_email, consent_at, consent_version, manage_token_hash)
       VALUES ($1, $2, false, $2, $3, now(), '2026-10', $4) RETURNING id`,
      [activityId, `Participant ${i + 1}`, email, `h-${activityId}-${i}-${email}`],
    );
    ids.push(rows[0].id);
  }
  return ids;
}

/** Contexte standard : responsable connecte + une activite ouverte avec les inscrits donnes. */
export async function mailingSetup({ env, options = {}, emails = ['a@mail.fr', 'b@mail.fr'] } = {}) {
  const ctx = await setup({ ...options, env: env ?? mailEnv() });
  ctx.activity = await newActivity(ctx, { capacity: null, title: 'Stage judo Toussaint' });
  if (emails.length) await addRegs(ctx.pool, ctx.activity.id, emails);
  ctx.send = (body) => ctx.api('post', '/api/mailings').send(body);
  ctx.body = (over = {}) => ({ activity_ids: [ctx.activity.id], subject: uniq(), body: 'Bonjour,\n\nRappel : kimono et gourde.', ...over });
  return ctx;
}

export const mailingRows = async (pool, id) =>
  (await pool.query('SELECT status, sent_count, failed_count FROM mailings WHERE id = $1', [id])).rows[0];

// Integration (slow) : envoi via un serveur SMTP de test en process (smtp-server). E1, E3, E4, E6, E9.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { hasDb, closeApp, BASE_URL } from '../../_support/harness.js';
import { mailingSetup, smtpEnv, startSmtp, closedPort, parseMessage, MAIL_FROM, CONTACT, uniq } from '../../_support/mailing.js';

describe.skipIf(!hasDb)('Mailing - SMTP', () => {
  let ctx;
  let smtp;
  beforeAll(async () => {
    smtp = await startSmtp({ rejectRcpt: ['refuse@mail.fr'] });
    ctx = await mailingSetup({ env: smtpEnv(smtp.port), emails: ['a@mail.fr', 'b@mail.fr', 'refuse@mail.fr'] });
  });
  afterAll(async () => {
    await closeApp(ctx);
    await smtp.close();
  });
  beforeEach(() => { smtp.messages.length = 0; });

  const envoyer = async (over, sel) => {
    const res = await ctx.send(ctx.body({ subject: uniq('Smtp'), body: 'Bonjour,\n\nRappel : kimono et gourde.', ...over }));
    return { res, mails: (sel ?? smtp.messages).map((m) => ({ ...m, parsed: parseMessage(m.raw) })) };
  };

  it('GET /api/mail/status : { transport: "smtp", from: MAIL_FROM } sans hote, port ni identifiants', async () => {
    const res = await ctx.api('get', '/api/mail/status');
    expect(res.body).toEqual({ transport: 'smtp', from: MAIL_FROM });
    expect(JSON.stringify(res.body)).not.toMatch(/127\.0\.0\.1|smtp\.|port/i);
  });

  it('un echec de destinataire : status partial, compteurs et statuts par destinataire', async () => {
    const { res } = await envoyer();
    expect(res.status).toBe(201);
    const m = res.body.mailing;
    expect(m).toMatchObject({ status: 'partial', transport: 'smtp', recipients_count: 3, sent_count: 2, failed_count: 1 });
    const { rows } = await ctx.pool.query('SELECT email, status, error FROM mailing_recipients WHERE mailing_id = $1 ORDER BY email', [m.id]);
    expect(rows.map((r) => [r.email, r.status])).toEqual([['a@mail.fr', 'sent'], ['b@mail.fr', 'sent'], ['refuse@mail.fr', 'failed']]);
    const refuse = rows.find((r) => r.status === 'failed');
    // E6 : code grossier, ni adresse ni hote/port SMTP
    expect(refuse.error).toBeTruthy();
    expect(refuse.error).not.toMatch(/@|127\.0\.0\.1|mailbox unavailable/i);
    expect(refuse.error).not.toContain(String(smtp.port));
    expect(rows.filter((r) => r.status === 'sent').every((r) => r.error === null)).toBe(true);
  });

  it('un message par destinataire : To = ce seul destinataire, enveloppe unique, ni Cc ni Bcc', async () => {
    const { mails } = await envoyer();
    const livres = mails.filter((m) => !m.rcpt.includes('refuse@mail.fr'));
    expect(livres.map((m) => m.rcpt).sort()).toEqual([['a@mail.fr'], ['b@mail.fr']]);
    for (const m of livres) {
      expect(m.parsed.headers.to).toHaveLength(1);
      expect(m.parsed.headers.to[0]).toContain(m.rcpt[0]);
      expect(m.parsed.headers.cc).toBeUndefined();
      expect(m.parsed.headers.bcc).toBeUndefined();
      for (const autre of ['a@mail.fr', 'b@mail.fr', 'refuse@mail.fr'].filter((x) => x !== m.rcpt[0])) expect(m.parsed.head).not.toContain(autre);
    }
  });

  it('From = MAIL_FROM (config) ; Reply-To absent ou = contact, jamais l\'e-mail de connexion du responsable', async () => {
    const { mails } = await envoyer();
    for (const m of mails) {
      expect(m.parsed.headers.from[0]).toContain('no-reply@club.test');
      expect(m.from).toBe('no-reply@club.test');
      const reply = m.parsed.headers['reply-to']?.[0];
      if (reply) expect(reply).toContain(CONTACT);
      expect(m.parsed.head).not.toContain('marie@club.fr');
    }
  });

  it('Subject = sujet saisi', async () => {
    const sujet = uniq('Rappel kimono');
    const { mails } = await envoyer({ subject: sujet });
    expect(mails[0].parsed.headers.subject[0]).toContain(sujet);
  });

  it('multipart text + html ; corps et pied de page (motif, activite, confidentialite, contact)', async () => {
    const { mails } = await envoyer();
    const p = mails[0].parsed;
    expect(p.text).toContain('Rappel : kimono et gourde.');
    expect(p.html).toContain('Rappel : kimono et gourde.');
    for (const part of [p.text, p.html]) {
      expect(part).toContain('Stage judo Toussaint');
      expect(part).toContain(CONTACT);
      expect(part).toContain(`${BASE_URL}/confidentialite`);
    }
  });

  it('List-Unsubscribe (URL one-click) + List-Unsubscribe-Post, jeton propre a chaque message', async () => {
    const { mails } = await envoyer();
    const tokens = mails.map((m) => {
      const h = m.parsed.headers['list-unsubscribe']?.[0] ?? '';
      expect(m.parsed.headers['list-unsubscribe-post']?.[0]).toBe('List-Unsubscribe=One-Click');
      expect(h).toContain(`${BASE_URL}/`);
      return h.match(/unsubscribe\/([A-Za-z0-9_-]{20,})/)?.[1] ?? h.match(/\/u\/([A-Za-z0-9_-]{20,})/)?.[1];
    });
    expect(tokens.every(Boolean)).toBe(true);
    expect(new Set(tokens).size).toBe(tokens.length);
    // jamais stocke en clair
    const { rows } = await ctx.pool.query('SELECT * FROM mailing_recipients');
    for (const t of tokens) expect(JSON.stringify(rows)).not.toContain(t);
  });

  it('tous les destinataires refuses : status failed, 201 renvoye avec le statut final', async () => {
    const seul = await startSmtp({ rejectRcpt: ['a@mail.fr', 'b@mail.fr', 'refuse@mail.fr'] });
    const c2 = await mailingSetup({ env: smtpEnv(seul.port), emails: ['a@mail.fr', 'b@mail.fr', 'refuse@mail.fr'] });
    try {
      const res = await c2.send(c2.body());
      expect(res.status).toBe(201);
      expect(res.body.mailing).toMatchObject({ status: 'failed', sent_count: 0, failed_count: 3 });
    } finally {
      await closeApp(c2);
      await seul.close();
    }
  });

  it('serveur SMTP injoignable : failed, code de connexion grossier (sans hote ni port)', async () => {
    const port = await closedPort();
    const c2 = await mailingSetup({ env: smtpEnv(port), emails: ['a@mail.fr'] });
    try {
      const res = await c2.send(c2.body());
      expect(res.status).toBe(201);
      expect(res.body.mailing.status).toBe('failed');
      const { rows } = await c2.pool.query('SELECT error FROM mailing_recipients WHERE mailing_id = $1', [res.body.mailing.id]);
      expect(rows[0].error).toBeTruthy();
      expect(rows[0].error).not.toMatch(/127\.0\.0\.1|ECONNREFUSED/);
      expect(rows[0].error).not.toContain(String(port));
    } finally {
      await closeApp(c2);
    }
  });
});

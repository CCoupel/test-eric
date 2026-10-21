// Integration (slow) : e-mail de confirmation d'inscription (seul message portant le lien de gestion — E10).
import { Writable } from 'node:stream';
import pino from 'pino';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { hasDb, closeApp } from '../../_support/harness.js';
import { register, tokenOf } from '../../_support/inscription.js';
import { mailingSetup, smtpEnv, mailEnv, startSmtp, closedPort, parseMessage, waitFor } from '../../_support/mailing.js';

describe.skipIf(!hasDb)('Confirmation - SMTP', () => {
  let ctx;
  let smtp;
  beforeAll(async () => {
    smtp = await startSmtp();
    ctx = await mailingSetup({ env: smtpEnv(smtp.port), emails: [] });
  });
  afterAll(async () => {
    await closeApp(ctx);
    await smtp.close();
  });
  beforeEach(() => { smtp.messages.length = 0; });

  it('apres inscription : un message au seul parent, contenant le manage_url de la reponse', async () => {
    const res = await register(ctx, ctx.activity.public_slug, { contact_email: 'parent@mail.fr', participant_name: 'Leo Martin' });
    expect(res.status).toBe(201);
    await waitFor(() => smtp.messages.length > 0);
    expect(smtp.messages).toHaveLength(1);
    const m = smtp.messages[0];
    const p = parseMessage(m.raw);
    expect(m.rcpt).toEqual(['parent@mail.fr']);
    expect(p.headers.from[0]).toContain('no-reply@club.test');
    expect(p.headers.cc).toBeUndefined();
    expect(p.headers.bcc).toBeUndefined();
    expect(p.text).toContain(res.body.manage_url);
    expect(p.html).toContain(res.body.manage_url);
    expect(p.text).toContain('Stage judo Toussaint');
    expect(p.headers['list-unsubscribe']).toBeUndefined(); // message transactionnel, pas un envoi groupe
  });

  it('le nom du participant est echappe dans la partie HTML', async () => {
    await register(ctx, ctx.activity.public_slug, { contact_email: 'esc@mail.fr', participant_name: "O'Brien & Fils" });
    await waitFor(() => smtp.messages.length > 0);
    const { html } = parseMessage(smtp.messages[0].raw);
    expect(html).not.toContain("O'Brien & Fils");
    expect(html).toMatch(/O(&#39;|&#x27;)Brien &amp; Fils/);
  });

  it('nom tres long : tronque dans le message', async () => {
    await register(ctx, ctx.activity.public_slug, { contact_email: 'long@mail.fr', participant_name: 'N'.repeat(120) });
    await waitFor(() => smtp.messages.length > 0);
    const { text } = parseMessage(smtp.messages[0].raw);
    expect(text).not.toContain('N'.repeat(120));
  });

  it('le jeton n\'est stocke ni dans mailings ni dans mailing_recipients', async () => {
    const res = await register(ctx, ctx.activity.public_slug, { contact_email: 'tok@mail.fr', participant_name: 'Tok' });
    await waitFor(() => smtp.messages.length > 0);
    const token = tokenOf(res);
    const { rows: a } = await ctx.pool.query('SELECT * FROM mailings');
    const { rows: b } = await ctx.pool.query('SELECT * FROM mailing_recipients');
    expect(JSON.stringify([a, b])).not.toContain(token);
    expect(a).toHaveLength(0);
  });

  it('non bloquant : SMTP injoignable -> inscription creee (201), manage_url renvoye', async () => {
    const port = await closedPort();
    const c2 = await mailingSetup({ env: smtpEnv(port), emails: [] });
    try {
      const res = await register(c2, c2.activity.public_slug, { contact_email: 'ko@mail.fr' });
      expect(res.status).toBe(201);
      expect(res.body.manage_url).toContain('/r/');
      const { rows } = await c2.pool.query('SELECT 1 FROM registrations WHERE contact_email = $1', ['ko@mail.fr']);
      expect(rows).toHaveLength(1);
    } finally {
      await closeApp(c2);
    }
  });

  it('non bloquant : destinataire refuse par le serveur SMTP -> 201', async () => {
    const s2 = await startSmtp({ rejectRcpt: ['refuse@mail.fr'] });
    const c2 = await mailingSetup({ env: smtpEnv(s2.port), emails: [] });
    try {
      expect((await register(c2, c2.activity.public_slug, { contact_email: 'refuse@mail.fr' })).status).toBe(201);
    } finally {
      await closeApp(c2);
      await s2.close();
    }
  });
});

describe.skipIf(!hasDb)('Confirmation - stub et journaux', () => {
  it('stub : 201, aucun envoi cree, ni lien de gestion ni adresse ni corps dans les journaux', async () => {
    const lines = [];
    const stream = new Writable({ write(c, _e, cb) { lines.push(c.toString()); cb(); } });
    const ctx = await mailingSetup({ env: mailEnv(), emails: [], options: { logger: pino({ level: 'info' }, stream) } });
    try {
      const res = await register(ctx, ctx.activity.public_slug, { contact_email: 'discret.parent@mail.fr', participant_name: 'Enfant Discret' });
      expect(res.status).toBe(201);
      await new Promise((r) => setTimeout(r, 300));
      const out = lines.join('');
      expect(out).not.toContain(tokenOf(res));
      expect(out).not.toContain(res.body.manage_url);
      expect(out).not.toContain('discret.parent@mail.fr');
      expect(out).not.toContain('Enfant Discret');
      const { rows } = await ctx.pool.query('SELECT count(*)::int AS n FROM mailings');
      expect(rows[0].n).toBe(0);
    } finally {
      await closeApp(ctx);
    }
  });

  it('inscription en double (409) : aucun second message', async () => {
    const smtp = await startSmtp();
    const ctx = await mailingSetup({ env: smtpEnv(smtp.port), emails: [] });
    try {
      await register(ctx, ctx.activity.public_slug, { contact_email: 'dup@mail.fr' });
      await waitFor(() => smtp.messages.length > 0);
      const second = await register(ctx, ctx.activity.public_slug, { contact_email: 'dup@mail.fr' });
      expect(second.status).toBe(409);
      await new Promise((r) => setTimeout(r, 500));
      expect(smtp.messages).toHaveLength(1);
    } finally {
      await closeApp(ctx);
      await smtp.close();
    }
  });
});

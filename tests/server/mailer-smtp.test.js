import { SMTPServer } from 'smtp-server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../../src/server/config.js';
import { createMailer } from '../../src/server/mailer/index.js';

const base = { DATABASE_URL: 'postgres://x@localhost/x', NODE_ENV: 'test' };

describe('config SMTP', () => {
  it('stub par défaut ; smtp si SMTP_HOST + MAIL_FROM ; mot de passe jamais exposé par transport/from', () => {
    expect(loadConfig(base).mail).toEqual({ transport: 'stub', from: null });
    expect(loadConfig({ ...base, MAIL_FROM: 'Club <no-reply@club.example>' }).mail).toEqual({ transport: 'stub', from: 'Club <no-reply@club.example>' }); // MAIL_FROM seul : stub
    const c = loadConfig({ ...base, SMTP_HOST: 'smtp.example', MAIL_FROM: 'Club <no-reply@club.example>', SMTP_USER: 'u', SMTP_PASS: 'p' });
    expect(c.mail).toMatchObject({ transport: 'smtp', host: 'smtp.example', port: 587, secure: false, from: 'Club <no-reply@club.example>' });
    expect(loadConfig({ ...base, SMTP_HOST: 'h', MAIL_FROM: 'a@b.fr', SMTP_SECURE: 'true' }).mail.port).toBe(465);
    for (const ok of ['a@b.fr', 'Club des sports <no-reply@club.example>', 'Club Élan 2026 <a@b.fr>']) {
      expect(loadConfig({ ...base, SMTP_HOST: 'h', MAIL_FROM: ok }).mail.from, ok).toBe(ok);
    }
  });
  it('refuse : paire incomplète, MAIL_FROM multiple ou avec CR/LF, port ou secure invalides, hôte douteux', () => {
    expect(() => loadConfig({ ...base, SMTP_HOST: 'h' })).toThrow(/MAIL_FROM est obligatoire/);
    expect(() => loadConfig({ ...base, SMTP_HOST: 'h', MAIL_FROM: 'a@b.fr', SMTP_USER: 'u' })).toThrow(/SMTP_USER et SMTP_PASS/);
    for (const bad of ['a@b.fr, c@d.fr', 'a@b.fr\nBcc: x@y.fr', 'pas une adresse', '<a@b.fr> <c@d.fr>', 'A, B <x@y.fr>', 'A; B <x@y.fr>', 'Club\r\nBcc: v@y.fr <x@y.fr>', '"Club" <x@y.fr>', 'Club <x@y.fr> <z@y.fr>', 'Club <a b@y.fr>', 'N@me <x@y.fr>']) {
      expect(() => loadConfig({ ...base, SMTP_HOST: 'h', MAIL_FROM: bad }), JSON.stringify(bad)).toThrow(/MAIL_FROM/);
    }
    expect(() => loadConfig({ ...base, SMTP_HOST: 'h', MAIL_FROM: 'a@b.fr', SMTP_PORT: '99999' })).toThrow(/SMTP_PORT/);
    expect(() => loadConfig({ ...base, SMTP_HOST: 'h', MAIL_FROM: 'a@b.fr', SMTP_SECURE: 'oui' })).toThrow(/SMTP_SECURE/);
    expect(() => loadConfig({ ...base, SMTP_HOST: 'h/evil', MAIL_FROM: 'a@b.fr' })).toThrow(/SMTP_HOST/);
  });
  it('TLS imposé par défaut hors hôte local, SMTP_REQUIRE_TLS surchargeable ; CONTACT_EMAIL strict', () => {
    const smtp = (over) => loadConfig({ ...base, MAIL_FROM: 'a@b.fr', ...over }).mail;
    expect(smtp({ SMTP_HOST: 'smtp.relais.example' }).requireTls).toBe(true);
    expect(smtp({ SMTP_HOST: '127.0.0.1' }).requireTls).toBe(false);
    expect(smtp({ SMTP_HOST: 'localhost' }).requireTls).toBe(false);
    expect(smtp({ SMTP_HOST: 'smtp.relais.example', SMTP_REQUIRE_TLS: 'false' }).requireTls).toBe(false);
    expect(smtp({ SMTP_HOST: '127.0.0.1', SMTP_REQUIRE_TLS: 'true' }).requireTls).toBe(true);
    expect(() => smtp({ SMTP_HOST: 'h', SMTP_REQUIRE_TLS: 'peut-etre' })).toThrow(/SMTP_REQUIRE_TLS/);
    for (const bad of ['a>,<https://x/y@z.fr', 'a@b.fr, c@d.fr', 'Nom <a@b.fr>', 'a b@c.fr']) {
      expect(() => loadConfig({ ...base, CONTACT_EMAIL: bad }), bad).toThrow(/CONTACT_EMAIL/);
    }
    expect(loadConfig({ ...base, CONTACT_EMAIL: 'rgpd@club.example' }).contactEmail).toBe('rgpd@club.example');
  });
  it('limites d’envoi : défauts et validation', () => {
    expect(loadConfig(base).mailLimits).toEqual({
      perUserPer10Min: 5, maxRecipients: 500, syncMaxRecipients: 100, confirmationPerAddressPerHour: 3, confirmationGlobalPerHour: 300, unsubscribePerIpPerMin: 60,
    });
    expect(() => loadConfig({ ...base, MAILING_MAX_RECIPIENTS: '0' })).toThrow(/MAILING_MAX_RECIPIENTS/);
  });
});

describe('transport stub', () => {
  it('n’envoie rien et ne journalise ni adresse ni corps (sujet tronqué seulement)', async () => {
    const log = { info: vi.fn() };
    const mailer = createMailer(loadConfig(base), log);
    expect(mailer.transport).toBe('stub');
    await mailer.send({ to: 'secret@mail.fr', subject: 'S'.repeat(100), text: 'corps secret', html: '<p>corps secret</p>' });
    const logged = JSON.stringify(log.info.mock.calls);
    expect(logged).not.toContain('secret');
    expect(logged).toContain('mail_stubbed');
  });
});

describe('transport SMTP (serveur de test local)', () => {
  const received = [];
  let server;
  let port;
  beforeAll(async () => {
    server = new SMTPServer({
      authOptional: true,
      disabledCommands: ['STARTTLS'],
      logger: false,
      onData(stream, session, cb) {
        const chunks = [];
        stream.on('data', (c) => chunks.push(c));
        stream.on('end', () => {
          received.push({ rcpt: session.envelope.rcptTo.map((r) => r.address), from: session.envelope.mailFrom.address, raw: Buffer.concat(chunks).toString() });
          cb();
        });
      },
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = server.server.address().port;
  });
  afterAll(() => new Promise((resolve) => server.close(resolve)));

  const smtpConfig = (over = {}) =>
    loadConfig({ ...base, SMTP_HOST: '127.0.0.1', SMTP_PORT: String(port), MAIL_FROM: 'Club <no-reply@club.example>', ...over });

  it('un message par destinataire : To unique, From = MAIL_FROM, en-têtes List-Unsubscribe, jamais de Bcc/Cc', async () => {
    const mailer = createMailer(smtpConfig(), { info: () => {} });
    expect(mailer.transport).toBe('smtp');
    await mailer.send({
      to: 'parent@mail.fr',
      subject: 'Sujet',
      text: 'texte',
      html: '<p>texte</p>',
      headers: { 'List-Unsubscribe': '<https://club.example/api/public/unsubscribe/T>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
    });
    const m = received.at(-1);
    expect(m.rcpt).toEqual(['parent@mail.fr']);
    expect(m.from).toBe('no-reply@club.example');
    expect(m.raw).toMatch(/^From: Club <no-reply@club\.example>/m);
    expect(m.raw).toMatch(/^To: parent@mail\.fr/m);
    expect(m.raw).toMatch(/^List-Unsubscribe: <https:\/\/club\.example\/api\/public\/unsubscribe\/T>/m);
    expect(m.raw).toMatch(/^List-Unsubscribe-Post: List-Unsubscribe=One-Click/m);
    expect(m.raw).not.toMatch(/^(Bcc|Cc):/im);
  });

  it('un destinataire hostile ne peut pas injecter de destinataire ou d’en-tête', async () => {
    const mailer = createMailer(smtpConfig(), { info: () => {} });
    const before = received.length;
    for (const to of ['a@mail.fr\r\nBcc: victime@mail.fr', 'a@mail.fr, victime@mail.fr', 'a@mail.fr;victime@mail.fr', 'Nom <a@mail.fr>', '"a b"@mail.fr', '', undefined, ['a@mail.fr']]) {
      const err = await mailer.send({ to, subject: 'S', text: 't', html: '<p>t</p>', headers: {} }).catch((e) => e);
      expect(err.code, JSON.stringify(to)).toBe('rejected');
    }
    expect(received.length).toBe(before); // rien n'est parti vers le serveur SMTP
  });

  it('erreur de connexion → code grossier « connection », sans adresse ni hôte dans l’erreur', async () => {
    const mailer = createMailer(loadConfig({ ...base, SMTP_HOST: '127.0.0.1', SMTP_PORT: '1', MAIL_FROM: 'a@b.fr' }), { info: () => {} });
    const err = await mailer.send({ to: 'x@mail.fr', subject: 's', text: 't', html: 't', headers: {} }).catch((e) => e);
    expect(['connection', 'timeout']).toContain(err.code); // selon l'OS, un port fermé est vu comme refus ou comme délai
    expect(err.message).toBe('mail_failed');
    expect(JSON.stringify(err)).not.toMatch(/127\.0\.0\.1|x@mail\.fr/);
  });
});

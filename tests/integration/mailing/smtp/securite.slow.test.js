// Integration (slow, scope security) : contenu des messages — HTML echappe, pas d'injection d'en-tete, pas d'autolien (E1, E2).
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { hasDb, closeApp, BASE_URL } from '../../_support/harness.js';
import { mailingSetup, smtpEnv, startSmtp, parseMessage, uniq } from '../../_support/mailing.js';

const HOSTILE = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '<a href="javascript:alert(1)">cliquez</a>',
  'Tom & Jerry "guillemets" l\'apostrophe',
  'lien nu : http://evil.example/phishing et www.evil.example',
].join('\n');

describe.skipIf(!hasDb)('Mailing - securite du contenu', () => {
  let ctx;
  let smtp;
  beforeAll(async () => {
    smtp = await startSmtp();
    ctx = await mailingSetup({ env: smtpEnv(smtp.port), emails: ['a@mail.fr'] });
  });
  afterAll(async () => {
    await closeApp(ctx);
    await smtp.close();
  });
  beforeEach(() => { smtp.messages.length = 0; });

  const envoyer = async (over) => {
    const res = await ctx.send(ctx.body({ subject: uniq('Secu'), ...over }));
    expect(res.status).toBe(201);
    return parseMessage(smtp.messages[0].raw);
  };

  it('corps HTML : & < > " \' echappes, aucune balise du client conservee', async () => {
    const { html } = await envoyer({ body: HOSTILE });
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<img/i);
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('Tom &amp; Jerry &quot;guillemets&quot;');
    expect(html).toMatch(/l(&#39;|&#x27;|&apos;)apostrophe/);
    expect(html).not.toMatch(/href="javascript:/i);
  });

  it('aucune autolinkification : les seuls liens sont ceux du pied de page (config.baseUrl)', async () => {
    const { html } = await envoyer({ body: HOSTILE });
    const liens = [...html.matchAll(/href="([^"]*)"/gi)].map((m) => m[1]);
    expect(liens.length).toBeGreaterThan(0);
    for (const l of liens) expect(l.startsWith(BASE_URL) || l.startsWith('mailto:'), `lien inattendu : ${l}`).toBe(true);
    expect(html).not.toMatch(/href="https?:\/\/evil\.example/i);
  });

  it('le texte brut garde le corps tel que saisi (pas de HTML interprete)', async () => {
    const { text } = await envoyer({ body: HOSTILE });
    expect(text).toContain('<script>alert(1)</script>');
  });

  it('CRLF + faux en-tetes dans le corps : aucun en-tete injecte (Bcc, Cc, Subject, From)', async () => {
    const piege = 'Bonjour\r\nBcc: victime@mail.fr\r\nCc: autre@mail.fr\r\nSubject: pirate\r\n\r\nFrom: pirate@evil.example';
    await envoyer({ body: piege });
    const m = smtp.messages[0];
    const p = parseMessage(m.raw);
    expect(m.rcpt).toEqual(['a@mail.fr']);
    expect(p.headers.bcc).toBeUndefined();
    expect(p.headers.cc).toBeUndefined();
    expect(p.head).not.toContain('victime@mail.fr');
    expect(p.head).not.toContain('pirate');
    expect(p.headers.from[0]).toContain('club.test');
  });

  it('sujet avec chevrons / & / accents : transmis sans injection (une seule ligne Subject)', async () => {
    const sujet = `${uniq('Reunion')} <b>&</b> éàü`;
    await envoyer({ subject: sujet });
    const p = parseMessage(smtp.messages[0].raw);
    expect(p.headers.subject).toHaveLength(1);
    expect(p.headers.subject[0]).not.toMatch(/[\r\n]/);
  });

  it('aucune piece jointe ni contenu lu sur disque / URL (corps "file:///etc/passwd")', async () => {
    await envoyer({ body: 'voir file:///etc/passwd et http://169.254.169.254/latest/meta-data' });
    const { head, rest } = parseMessage(smtp.messages[0].raw);
    expect(`${head}${rest}`).not.toMatch(/root:x:0:0/);
    expect(head).not.toMatch(/multipart\/mixed/i);
  });
});

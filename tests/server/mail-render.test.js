import { describe, expect, it } from 'vitest';
import { classifyMailError } from '../../src/server/mailer/index.js';
import { bulkMessage, confirmationMessage, escapeHtml, isSafeSubject, textToHtml } from '../../src/server/mailer/render.js';

const config = { baseUrl: 'https://club.example', contactEmail: 'contact@club.example' };

describe('textToHtml / escapeHtml', () => {
  it('échappe tout HTML client puis crée paragraphes et <br> ; aucune autolinkification', () => {
    const html = textToHtml('Bonjour <script>alert(1)</script>\nligne 2\n\n<img src=x onerror=alert(1)> javascript:alert(1) https://evil.example');
    expect(html).toBe(
      '<p>Bonjour &lt;script&gt;alert(1)&lt;/script&gt;<br>ligne 2</p>\n<p>&lt;img src=x onerror=alert(1)&gt; javascript:alert(1) https://evil.example</p>',
    );
    expect(html).not.toMatch(/<script|<img|<a /i);
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
  });
  it('normalise les retours chariot', () => {
    expect(textToHtml('a\r\nb\r\n\r\nc')).toBe('<p>a<br>b</p>\n<p>c</p>');
  });
});

describe('isSafeSubject', () => {
  it('refuse CR, LF, NUL, tabulation et séparateurs de ligne Unicode', () => {
    for (const bad of ['a\r\nBcc: x@y.fr', 'a\nb', 'a\rb', 'a\0b', 'a\tb', 'a b', 'a b']) expect(isSafeSubject(bad), JSON.stringify(bad)).toBe(false);
    expect(isSafeSubject('Stage de Toussaint — départ 9 h')).toBe(true);
  });
});

describe('bulkMessage', () => {
  const m = bulkMessage({
    config,
    subject: 'Sujet',
    body: 'Corps <b>x</b>',
    activityTitles: ['Judo <i>', 'Karaté'],
    unsubscribeUrl: 'https://club.example/api/public/unsubscribe/TOK',
    unsubscribePageUrl: 'https://club.example/u/TOK',
  });
  it('en-têtes RFC 8058 (URL https + mailto) et pied de page avec motif, désinscription, confidentialité, contact', () => {
    expect(m.headers['List-Unsubscribe']).toBe('<https://club.example/api/public/unsubscribe/TOK>, <mailto:contact@club.example?subject=unsubscribe>');
    expect(m.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    expect(m.text).toContain('Judo <i>, Karaté');
    expect(m.text).toContain('https://club.example/u/TOK');
    expect(m.text).toContain('https://club.example/confidentialite');
    expect(m.text).toContain('contact@club.example');
  });
  it('HTML : corps et titres échappés, seuls les liens du pied de page', () => {
    expect(m.html).toContain('Corps &lt;b&gt;x&lt;/b&gt;');
    expect(m.html).toContain('Judo &lt;i&gt;');
    expect(m.html.match(/<a href="/g)).toHaveLength(2);
    expect(m.html).not.toContain('<b>');
  });
  it('sans CONTACT_EMAIL : pas de mailto', () => {
    const n = bulkMessage({ config: { ...config, contactEmail: null }, subject: 's', body: 'b', activityTitles: ['A'], unsubscribeUrl: 'https://x/u', unsubscribePageUrl: 'https://x/p' });
    expect(n.headers['List-Unsubscribe']).toBe('<https://x/u>');
  });
});

describe('confirmationMessage', () => {
  it('contenu minimal, nom tronqué et échappé, lien de gestion présent, sujet sans caractère de contrôle', () => {
    const m = confirmationMessage({ config, activityTitle: 'Stage\r\nBcc: x', participantName: `<b>${'x'.repeat(100)}</b>`, manageUrl: 'https://club.example/r/TOK' });
    expect(m.subject).not.toMatch(/[\r\n]/);
    expect(m.text).toContain('https://club.example/r/TOK');
    expect(m.html).toContain('&lt;b&gt;');
    expect(m.html).not.toContain('<b>');
    expect(m.text.length).toBeLessThan(900);
  });
});

describe('classifyMailError', () => {
  it('codes grossiers, sans adresse ni hôte', () => {
    expect(classifyMailError({ code: 'ETIMEDOUT' })).toBe('timeout');
    expect(classifyMailError({ code: 'ECONNREFUSED' })).toBe('connection');
    expect(classifyMailError({ code: 'EAUTH' })).toBe('auth');
    expect(classifyMailError({ responseCode: 550 })).toBe('rejected');
    expect(classifyMailError({ code: 'EENVELOPE' })).toBe('rejected');
    expect(classifyMailError(new Error('boom user@x.fr smtp.host'))).toBe('other');
    expect(classifyMailError(undefined)).toBe('other');
  });
});

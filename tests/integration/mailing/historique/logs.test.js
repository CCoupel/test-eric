// Integration (scope security) : journaux d'envoi — evenements sans donnees personnelles (E4, E10, E11).
import { Writable } from 'node:stream';
import pino from 'pino';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hasDb, closeApp } from '../../_support/harness.js';
import { mailingSetup, uniq } from '../../_support/mailing.js';

const EMAILS = ['alice.secrete@mail.fr', 'bob.secret@mail.fr'];
const CORPS = 'Texte-confidentiel-du-corps-9a7';

describe.skipIf(!hasDb)('Mailing - journaux', () => {
  let ctx;
  let userId;
  const lines = [];
  const events = () => lines.map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  beforeAll(async () => {
    const stream = new Writable({ write(c, _e, cb) { lines.push(c.toString()); cb(); } });
    ctx = await mailingSetup({ emails: EMAILS, options: { logger: pino({ level: 'info' }, stream) } });
    userId = (await ctx.api('get', '/api/auth/me')).body.user.id;
  });
  afterAll(() => closeApp(ctx));

  it('envoi : evenement mailing_sent {userId, mailingId, recipients, sent, failed} ; aucune adresse, aucun corps', async () => {
    const sujet = uniq('Sujet-journal');
    const res = await ctx.send(ctx.body({ subject: sujet, body: CORPS }));
    expect(res.status).toBe(201);
    const ev = events().find((o) => o.event === 'mailing_sent');
    expect(ev, 'evenement mailing_sent').toBeDefined();
    expect(ev).toMatchObject({ mailingId: res.body.mailing.id, recipients: 2, failed: 0 });
    expect(JSON.stringify(ev)).toContain(userId);
    const out = lines.join('');
    for (const e of EMAILS) expect(out).not.toContain(e);
    expect(out).not.toContain(CORPS);
  });

  it('transport stub : ni adresses ni corps complet dans les journaux', async () => {
    await ctx.send(ctx.body({ subject: uniq('Stub'), body: CORPS.repeat(5) }));
    const out = lines.join('');
    expect(out).not.toContain(CORPS);
    expect(out).not.toMatch(/@mail\.fr/);
  });

  it('consultation du detail : mailing_viewed {userId, mailingId} sans donnees personnelles', async () => {
    const m = (await ctx.send(ctx.body({ subject: uniq('Vue'), body: CORPS }))).body.mailing;
    lines.length = 0;
    expect((await ctx.api('get', `/api/mailings/${m.id}`)).status).toBe(200);
    const ev = events().find((o) => o.event === 'mailing_viewed');
    expect(ev, 'evenement mailing_viewed').toBeDefined();
    expect(ev).toMatchObject({ userId, mailingId: m.id });
    const out = lines.join('');
    for (const e of EMAILS) expect(out).not.toContain(e);
    expect(out).not.toContain(CORPS);
  });

  it('apercu des destinataires : aucune adresse journalisee', async () => {
    lines.length = 0;
    await ctx.api('get', `/api/mailings/recipients-preview?activity_ids=${ctx.activity.id}`);
    for (const e of EMAILS) expect(lines.join('')).not.toContain(e);
  });
});

// Integration (slow) : desabonnement en un clic (RFC 8058) — decision utilisateur.
//   GET /u/:token = page (jamais mutante) ; POST /api/public/unsubscribe/:token = effet : desinscription de l'activite.
//   Jeton propre a chaque message, usage unique, 404 uniformes, absent des journaux et des listes.
import { Writable } from 'node:stream';
import pino from 'pino';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hasDb, closeApp } from '../../_support/harness.js';
import { newActivity } from '../../_support/inscription.js';
import { mailingSetup, smtpEnv, startSmtp, parseMessage, addRegs, uniq } from '../../_support/mailing.js';

const tokenDe = (parsed) => {
  const h = parsed.headers['list-unsubscribe']?.[0] ?? '';
  return h.match(/unsubscribe\/([A-Za-z0-9_-]{20,})/)?.[1] ?? h.match(/\/u\/([A-Za-z0-9_-]{20,})/)?.[1];
};

describe.skipIf(!hasDb)('Mailing - desabonnement en un clic', () => {
  let ctx;
  let smtp;
  let tokens; // { 'a@mail.fr': token, ... }
  let mailingId;
  const lines = [];
  const unsub = (t) => request(ctx.app).post(`/api/public/unsubscribe/${t}`).type('form').send('List-Unsubscribe=One-Click'); // sans cookie ni Origin (client de messagerie)
  const present = async (email) => (await ctx.pool.query('SELECT 1 FROM registrations WHERE contact_email = $1', [email])).rowCount === 1;

  beforeAll(async () => {
    smtp = await startSmtp();
    const stream = new Writable({ write(c, _e, cb) { lines.push(c.toString()); cb(); } });
    ctx = await mailingSetup({ env: smtpEnv(smtp.port), emails: ['a@mail.fr', 'b@mail.fr', 'c@mail.fr'], options: { logger: pino({ level: 'info' }, stream) } });
    const res = await ctx.send(ctx.body({ subject: uniq('Desabo') }));
    mailingId = res.body.mailing.id;
    tokens = {};
    for (const m of smtp.messages) tokens[m.rcpt[0]] = tokenDe(parseMessage(m.raw));
  });
  afterAll(async () => {
    await closeApp(ctx);
    await smtp.close();
  });

  it('chaque message porte un jeton distinct, present aussi dans le lien du pied de page (/u/<jeton>)', () => {
    expect(Object.keys(tokens).sort()).toEqual(['a@mail.fr', 'b@mail.fr', 'c@mail.fr']);
    expect(new Set(Object.values(tokens)).size).toBe(3);
    for (const m of smtp.messages) {
      const p = parseMessage(m.raw);
      expect(p.text).toContain(`/u/${tokenDe(p)}`);
      expect(p.html).toContain(`/u/${tokenDe(p)}`);
    }
  });

  it('GET /api/public/unsubscribe/:token et GET /u/:token ne modifient rien (anti-prefetch)', async () => {
    const t = tokens['a@mail.fr'];
    const info = await request(ctx.app).get(`/api/public/unsubscribe/${t}`);
    expect(info.status).toBe(200);
    expect(JSON.stringify(info.body)).toContain('Stage judo Toussaint');
    expect(JSON.stringify(info.body)).not.toContain('a@mail.fr');
    await request(ctx.app).get(`/u/${t}`);
    expect(await present('a@mail.fr')).toBe(true);
    const ligne = (await ctx.pool.query('SELECT email FROM mailing_recipients WHERE mailing_id = $1 AND email = $2', [mailingId, 'a@mail.fr'])).rowCount;
    expect(ligne).toBe(1);
  });

  it('POST one-click : 2xx, desinscription effective de ce destinataire seulement', async () => {
    const res = await unsub(tokens['a@mail.fr']);
    expect([200, 204]).toContain(res.status);
    expect(await present('a@mail.fr')).toBe(false);
    expect(await present('b@mail.fr')).toBe(true);
    expect(await present('c@mail.fr')).toBe(true);
  });

  it('effet RGPD : adresse effacee de l\'historique (ligne conservee), place liberee, retrait de la liste des inscrits', async () => {
    const detail = await ctx.api('get', `/api/mailings/${mailingId}`);
    expect(detail.body.recipients).toHaveLength(3);
    expect(detail.body.recipients.filter((r) => r.email === null)).toHaveLength(1);
    expect(JSON.stringify(detail.body)).not.toContain('a@mail.fr');
    const liste = await ctx.api('get', `/api/activities/${ctx.activity.id}/registrations`);
    expect(liste.body.registrations.map((r) => r.contact_email).sort()).toEqual(['b@mail.fr', 'c@mail.fr']);
  });

  it('usage unique : 2e POST avec le meme jeton -> 404', async () => {
    const res = await unsub(tokens['a@mail.fr']);
    expect(res.status).toBe(404);
  });

  it('404 uniformes : jeton inconnu, mal forme, deja utilise, GET et POST (meme corps, pas d\'enumeration)', async () => {
    const candidats = [tokens['a@mail.fr'], 'inconnu', 'A'.repeat(43), '%00', 'x'.repeat(500)];
    const corps = [];
    for (const t of candidats) {
      const post = await unsub(encodeURIComponent(t));
      expect(post.status, `POST ${t.slice(0, 10)}`).toBe(404);
      corps.push(post.body);
      const get = await request(ctx.app).get(`/api/public/unsubscribe/${encodeURIComponent(t)}`);
      expect(get.status, `GET ${t.slice(0, 10)}`).toBe(404);
      corps.push(get.body);
    }
    for (const b of corps) expect(b).toEqual(corps[0]);
  });

  it('jeton jamais stocke en clair, absent des listes, du detail et des journaux', async () => {
    const t = tokens['b@mail.fr'];
    const { rows } = await ctx.pool.query('SELECT * FROM mailing_recipients');
    expect(JSON.stringify(rows)).not.toContain(t);
    expect(JSON.stringify((await ctx.api('get', '/api/mailings')).body)).not.toContain(t);
    expect(JSON.stringify((await ctx.api('get', `/api/mailings/${mailingId}`)).body)).not.toContain(t);
    await unsub(t);
    await request(ctx.app).get(`/u/${t}`);
    const out = lines.join('');
    expect(out).not.toContain(t);
    expect(out).not.toContain('b@mail.fr');
  });

  it('Cache-Control no-store sur la reponse', async () => {
    const res = await unsub(tokens['c@mail.fr']);
    expect(res.headers['cache-control']).toMatch(/no-store/);
  });

  it('desabonnement apres le retrait de l\'inscrit par ailleurs : 404', async () => {
    const act = await newActivity(ctx, { title: 'Autre', capacity: null });
    await addRegs(ctx.pool, act.id, ['z@mail.fr']);
    smtp.messages.length = 0;
    await ctx.send(ctx.body({ activity_ids: [act.id], subject: uniq('Autre') }));
    const t = tokenDe(parseMessage(smtp.messages[0].raw));
    await ctx.pool.query('DELETE FROM registrations WHERE contact_email = $1', ['z@mail.fr']);
    expect((await unsub(t)).status).toBe(404);
  });
});

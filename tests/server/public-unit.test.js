import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import pino from 'pino';
import request from 'supertest';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { createApp, maskUrl } from '../../src/server/app.js';
import { loadConfig } from '../../src/server/config.js';
import { consentText } from '../../src/server/consent.js';
import { schedulePurge } from '../../src/server/jobs/purge.js';

const cfg = (extra = {}) => loadConfig({ DATABASE_URL: 'postgres://x@localhost/x', NODE_ENV: 'test', ...extra });

describe('maskUrl', () => {
  it('masque le token de gestion dans les URLs journalisées, garde le reste', () => {
    expect(maskUrl('/api/public/registrations/abcDEF123_-xyz')).toBe('/api/public/registrations/[redacted]');
    expect(maskUrl('/api/public/registrations/abc?x=1')).toBe('/api/public/registrations/[redacted]?x=1');
    expect(maskUrl('/r/abcDEF')).toBe('/r/[redacted]');
    expect(maskUrl('/api/activities/42')).toBe('/api/activities/42');
    const tok = 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0U1v'; // 43 car.
    expect(tok).toHaveLength(43);
    expect(maskUrl(`//r/${tok}`)).toBe('//r/[redacted]');
    expect(maskUrl(`/x/%72/${tok}?a=1`)).toBe('/x/%72/[redacted]?a=1');
    expect(maskUrl(undefined)).toBe('');
  });
});

describe('config — conservation et limites publiques', () => {
  it('RETENTION_MONTHS défaut 12, bornes 1..120 ; limites surchargeables et validées', () => {
    expect(cfg().retentionMonths).toBe(12);
    expect(cfg({ RETENTION_MONTHS: '6' }).retentionMonths).toBe(6);
    for (const bad of ['0', '-1', 'abc', '121', '1.5']) expect(() => cfg({ RETENTION_MONTHS: bad })).toThrow(/RETENTION_MONTHS/);
    expect(cfg().publicLimits).toEqual({ registrationPerIpPerMin: 20, registrationPerActivityPer10Min: 10, tokenPerIpPerMin: 30, viewPerIpPerMin: 60 });
    expect(cfg({ RATE_LIMIT_TOKEN_PER_IP_MIN: '5' }).publicLimits.tokenPerIpPerMin).toBe(5);
    expect(() => cfg({ RATE_LIMIT_VIEW_PER_IP_MIN: '0' })).toThrow(/RATE_LIMIT_VIEW_PER_IP_MIN/);
  });
});

describe('texte de consentement', () => {
  it('mentionne le parent/représentant légal pour un mineur, la durée de conservation et le droit de suppression', () => {
    const t = consentText(cfg({ RETENTION_MONTHS: '12' }));
    expect(t).toMatch(/mineur/);
    expect(t).toMatch(/parent|représentant légal/);
    expect(t).toMatch(/12 mois/);
    expect(t).toMatch(/supprimer/);
  });
});

describe('page de gestion /r/:token', () => {
  const dir = mkdtempSync(join((mkdirSync('_work/tmp', { recursive: true }), '_work/tmp'), 'web-'));
  writeFileSync(join(dir, 'index.html'), '<title>spa</title>');
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const app = createApp({ config: cfg(), pool: { query: async () => ({}) }, webDir: dir });

  it('Cache-Control: no-store et Referrer-Policy: no-referrer ; autres pages SPA non concernées', async () => {
    const r = await request(app).get('/r/abc');
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.headers['referrer-policy']).toBe('no-referrer');
    expect((await request(app).get('/activities')).headers['cache-control']).not.toBe('no-store');
  });
});

describe('schedulePurge', () => {
  it('journalise l’échec (code/message seulement) sans planter ; timer unref', async () => {
    const log = { log: vi.fn(), error: vi.fn() };
    const pool = { connect: async () => { throw Object.assign(new Error('db down'), { code: 'ECONNREFUSED' }); } };
    const { timer, first } = schedulePurge(pool, cfg(), log);
    await first;
    clearInterval(timer);
    expect(log.error).toHaveBeenCalledWith({ message: 'db down', code: 'ECONNREFUSED' }, expect.stringContaining('purge'));
    expect(timer.hasRef()).toBe(false);
  });
});

describe('erreur 500 sur route publique', () => {
  it('le log ne contient ni le detail pg (valeurs saisies) ni le token ; la réponse reste générique', async () => {
    const lines = [];
    const logger = pino({ level: 'info' }, { write: (l) => lines.push(l) });
    const pgErr = Object.assign(new Error('boom'), { detail: 'Key (contact_email)=(parent@secret.fr) already exists', parameters: ['parent@secret.fr'], code: 'XX000' });
    const app = createApp({ config: cfg(), pool: { query: async () => { throw pgErr; } }, logger });
    const token = 'A'.repeat(43);
    const res = await request(app).get(`/api/public/registrations/${token}`).set('Referer', `http://localhost:3000/r/${token}`);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'internal_error', message: 'Erreur interne' });
    const all = lines.join('');
    expect(all).not.toContain('parent@secret.fr');
    expect(all).not.toContain(token);
    expect(all).toContain('[redacted]');
  });
});

describe('maskUrl — casse', () => {
  it('masque aussi /R/<token> et /API/PUBLIC/REGISTRATIONS/<token> (Express route sans casse)', () => {
    expect(maskUrl('/R/abc')).toBe('/R/[redacted]');
    expect(maskUrl('/API/PUBLIC/REGISTRATIONS/abc')).toBe('/API/PUBLIC/REGISTRATIONS/[redacted]');
  });
});

describe('GET /api/public/info et CONTACT_EMAIL', () => {
  const info = async (extra) => request(createApp({ config: cfg(extra), pool: { query: async () => ({}) } })).get('/api/public/info');

  it('contact_email = CONTACT_EMAIL ou null, jamais ADMIN_EMAIL ; retention_months exposé ; no-store', async () => {
    const admin = { ADMIN_EMAIL: 'admin@club.fr', ADMIN_PASSWORD: 'Zx9-sel-unique-12+' };
    let res = await info({ ...admin, CONTACT_EMAIL: 'rgpd@club.fr', RETENTION_MONTHS: '6' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ contact_email: 'rgpd@club.fr', consent_version: '2026-10-r6', retention_months: 6 });
    expect(res.headers['cache-control']).toBe('no-store');
    res = await info(admin);
    expect(res.body).toEqual({ contact_email: null, consent_version: '2026-10', retention_months: 12 });
    expect(JSON.stringify(res.body)).not.toContain('admin@club.fr');
    expect((await info()).body.contact_email).toBeNull();
  });
  it('CONTACT_EMAIL invalide refusé au démarrage', () => {
    expect(() => cfg({ CONTACT_EMAIL: 'pasunemail' })).toThrow(/CONTACT_EMAIL/);
  });
  it('lecture seule : POST → 404, rate-limit 60/min configurable → 429', async () => {
    const app = createApp({ config: cfg({ RATE_LIMIT_VIEW_PER_IP_MIN: '2' }), pool: { query: async () => ({}) } });
    expect((await request(app).post('/api/public/info').send({})).status).toBe(404);
    await request(app).get('/api/public/info');
    await request(app).get('/api/public/info');
    expect((await request(app).get('/api/public/info')).status).toBe(429);
  });
});

describe('limiteur du désabonnement', () => {
  const token = 'A'.repeat(43);
  const app = (extra) => createApp({ config: cfg(extra), pool: { query: async () => ({ rows: [] }) } });

  it('défaut 60/min/IP ; surcharge par RATE_LIMIT_UNSUBSCRIBE_PER_IP_MIN ; 429 au-delà (GET et POST partagent le compteur)', async () => {
    expect(cfg().mailLimits.unsubscribePerIpPerMin).toBe(60);
    const a = app({ RATE_LIMIT_UNSUBSCRIBE_PER_IP_MIN: '2' });
    expect((await request(a).get(`/api/public/unsubscribe/${token}`)).status).toBe(404);
    expect((await request(a).get(`/api/public/unsubscribe/${token}`)).status).toBe(404);
    const res = await request(a).post(`/api/public/unsubscribe/${token}`);
    expect(res.status).toBe(429);
    expect(res.body.error).toBe('rate_limited');
  });
  it('plus indulgent que les tokens de gestion (30/min), mais borné', () => {
    const lim = cfg().mailLimits.unsubscribePerIpPerMin;
    expect(lim).toBeGreaterThan(cfg().publicLimits.tokenPerIpPerMin);
    expect(lim).toBeLessThanOrEqual(100);
  });
});

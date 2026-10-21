import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/server/app.js';
import { loadConfig } from '../../src/server/config.js';

const cfg = (extra = {}) => loadConfig({ DATABASE_URL: 'postgres://x@localhost/x', NODE_ENV: 'test', ...extra });
const okPool = { query: async () => ({}) };
const downPool = { query: async () => { throw new Error('down'); } };

mkdirSync('_work/tmp', { recursive: true });
const webDir = mkdtempSync(join('_work/tmp', 'web-'));
writeFileSync(join(webDir, 'index.html'), '<!doctype html><title>spa</title>');
writeFileSync(join(webDir, 'app.js'), 'console.log(1)');
afterAll(() => rmSync(webDir, { recursive: true, force: true }));

describe('GET /health', () => {
  it('200 avec la version du contrat quand la base répond', async () => {
    const res = await request(createApp({ config: cfg(), pool: okPool })).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', version: '0.1.0.0', db: 'ok' });
  });
  it('503 avec db=error quand la base est injoignable, sans détail de connexion', async () => {
    const res = await request(createApp({ config: cfg(), pool: downPool })).get('/health');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'error', version: '0.1.0.0', db: 'error' });
  });
});

describe('en-têtes helmet selon le protocole', () => {
  const headers = async (baseUrl) =>
    (await request(createApp({ config: cfg({ APP_BASE_URL: baseUrl }), pool: okPool })).get('/health')).headers;

  it('http : ni HSTS ni upgrade-insecure-requests', async () => {
    const h = await headers('http://localhost:3000');
    expect(h['strict-transport-security']).toBeUndefined();
    expect(h['content-security-policy']).not.toContain('upgrade-insecure-requests');
  });
  it('https : HSTS et upgrade-insecure-requests actifs', async () => {
    const h = await headers('https://club.example');
    expect(h['strict-transport-security']).toBeDefined();
    expect(h['content-security-policy']).toContain('upgrade-insecure-requests');
  });
});

describe('statique, fallback SPA et erreurs', () => {
  const app = createApp({ config: cfg(), pool: okPool, webDir });

  it('sert les fichiers statiques et le fallback SPA', async () => {
    expect((await request(app).get('/app.js')).status).toBe(200);
    const spa = await request(app).get('/activities/42');
    expect(spa.status).toBe(200);
    expect(spa.text).toContain('<title>spa</title>');
  });
  it('ne renvoie pas la SPA pour /api, /api/x et /health/', async () => {
    for (const path of ['/api', '/api/inconnu']) {
      const res = await request(app).get(path);
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('not_found');
    }
    expect((await request(app).get('/health/')).body.status).toBe('ok');
  });
  it('sans dist/web : pas de fallback', async () => {
    const bare = createApp({ config: cfg(), pool: okPool, webDir: join(webDir, 'absent') });
    expect((await request(bare).get('/activities')).status).toBe(404);
  });
  it('JSON invalide → 400 validation_error', async () => {
    const res = await request(app).post('/api/x').set('Content-Type', 'application/json').send('{oops');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_error');
  });
  it('corps trop grand → 413 (pas 500)', async () => {
    const res = await request(app).post('/api/x').send({ blob: 'x'.repeat(200_000) });
    expect(res.status).toBe(413);
    expect(res.body.error).toBe('bad_request');
  });
});

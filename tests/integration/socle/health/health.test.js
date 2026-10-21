// Integration : GET /health (contrat : contracts/http-endpoints.md, section Sante).
//   DB joignable   -> 200 { status: "ok", version, db: "ok" }
//   DB injoignable -> 503 { ..., db: "error" }
// DATABASE_URL est lue dans l'environnement (jamais codee en dur). Migrations/base vide : globalSetup
// Vitest de dev-backend (non duplique ici). L'app est importee dynamiquement APRES positionnement de
// l'environnement ; elle doit lire DATABASE_URL a l'import / a la creation (src/server/app.js).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';

const REAL_DATABASE_URL = process.env.DATABASE_URL;
const hasDb = Boolean(REAL_DATABASE_URL);

async function loadApp() {
  vi.resetModules();
  const mod = await import('../../../../src/server/app.js');
  const factory = mod.createApp ?? mod.default;
  return typeof factory === 'function' ? await factory() : factory;
}

describe('GET /health', () => {
  afterEach(() => {
    process.env.DATABASE_URL = REAL_DATABASE_URL;
  });

  describe.skipIf(!hasDb)('base joignable', () => {
    beforeEach(() => {
      process.env.DATABASE_URL = REAL_DATABASE_URL;
    });

    it('repond 200 avec status ok, db ok et une version', async () => {
      const res = await request(await loadApp()).get('/health');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/application\/json/);
      expect(res.body).toMatchObject({ status: 'ok', db: 'ok' });
      expect(res.body.version).toMatch(/^\d+\.\d+\.\d+(\.\d+)?$/);
    });

    it('est public : aucun cookie requis', async () => {
      const res = await request(await loadApp()).get('/health');
      expect(res.status).not.toBe(401);
    });

    it('ne divulgue pas la chaine de connexion ni de secret', async () => {
      const res = await request(await loadApp()).get('/health');
      expect(JSON.stringify(res.body)).not.toContain('postgres://');
    });
  });

  describe('base injoignable', () => {
    beforeEach(() => {
      // Port ferme : connexion refusee immediatement.
      process.env.DATABASE_URL = 'postgres://club:club@127.0.0.1:1/club_test';
    });

    it('repond 503 avec db error', async () => {
      const res = await request(await loadApp()).get('/health');
      expect(res.status).toBe(503);
      expect(res.body.db).toBe('error');
    });

    it('ne divulgue ni la chaine de connexion ni le mot de passe', async () => {
      const res = await request(await loadApp()).get('/health');
      const txt = JSON.stringify(res.body);
      expect(txt).not.toContain('postgres://');
      expect(txt).not.toContain('club:club');
    });
  });
});

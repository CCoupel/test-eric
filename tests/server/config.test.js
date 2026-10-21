import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../../src/server/config.js';

const SECRET = 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6';
const base = { DATABASE_URL: 'postgres://u:p@localhost:5432/db', SESSION_SECRET: SECRET };

describe('loadConfig', () => {
  it('applique les défauts de développement', () => {
    const c = loadConfig(base);
    expect(c).toMatchObject({ nodeEnv: 'development', port: 3000, baseUrl: 'http://localhost:3000', consentTextVersion: '2026-10' });
  });
  it('lit les valeurs fournies et retire le slash final', () => {
    const c = loadConfig({ ...base, APP_PORT: '8080', APP_BASE_URL: 'https://club.example/', NODE_ENV: 'production' });
    expect(c).toMatchObject({ port: 8080, baseUrl: 'https://club.example', isProduction: true });
  });
  it('déduit https de APP_BASE_URL', () => {
    expect(loadConfig(base).https).toBe(false);
    expect(loadConfig({ ...base, APP_BASE_URL: 'https://club.example' }).https).toBe(true);
  });
  it('exige DATABASE_URL', () => {
    expect(() => loadConfig({})).toThrow(ConfigError);
  });
  it('rejette un port, un NODE_ENV et une URL invalides en listant tous les problèmes', () => {
    try {
      loadConfig({ ...base, APP_PORT: 'abc', NODE_ENV: 'foo', APP_BASE_URL: 'nope' });
      expect.unreachable();
    } catch (e) {
      expect(e.problems).toHaveLength(3);
    }
  });
  it('exige APP_BASE_URL en production et un schéma postgres://', () => {
    expect(() => loadConfig({ ...base, NODE_ENV: 'production' })).toThrow(/APP_BASE_URL/);
    expect(() => loadConfig({ DATABASE_URL: 'mysql://x', SESSION_SECRET: SECRET })).toThrow(/postgres/);
  });
  it('SESSION_SECRET : obligatoire hors test, ≥ 32 caractères, défaut fixe en test', () => {
    const noSecret = { DATABASE_URL: base.DATABASE_URL };
    expect(() => loadConfig(noSecret)).toThrow(/SESSION_SECRET est obligatoire/);
    expect(() => loadConfig({ ...base, SESSION_SECRET: 'court' })).toThrow(/32 caractères/);
    expect(loadConfig({ ...noSecret, NODE_ENV: 'test' }).sessionSecret.length).toBeGreaterThanOrEqual(32);
    expect(loadConfig(base).sessionSecret).toBe(SECRET);
  });
  it('compte admin initial : tout ou rien, e-mail valide, mot de passe ≥ 12', () => {
    expect(loadConfig(base).admin).toBeNull();
    expect(() => loadConfig({ ...base, ADMIN_EMAIL: 'a@b.fr' })).toThrow(/ensemble/);
    expect(() => loadConfig({ ...base, ADMIN_EMAIL: 'pasunemail', ADMIN_PASSWORD: 'Zx9-sel-unique' })).toThrow(/ADMIN_EMAIL invalide/);
    expect(() => loadConfig({ ...base, ADMIN_EMAIL: 'a@b.fr', ADMIN_PASSWORD: 'court' })).toThrow(/12 caractères/);
    expect(loadConfig({ ...base, ADMIN_EMAIL: 'a@b.fr', ADMIN_PASSWORD: 'Zx9-sel-unique' }).admin).toEqual({
      email: 'a@b.fr',
      password: 'Zx9-sel-unique',
      name: 'Administrateur',
    });
  });
  it('refuse un ADMIN_PASSWORD trivial ou d’exemple, et un SESSION_SECRET peu varié', () => {
    for (const bad of ['Password123!!', 'ChangeMe-1234567', 'motdepasse-solide-1', 'admin-admin-admin']) {
      expect(() => loadConfig({ ...base, ADMIN_EMAIL: 'a@b.fr', ADMIN_PASSWORD: bad }), bad).toThrow(/triviale/);
    }
    expect(() => loadConfig({ ...base, SESSION_SECRET: 'ab'.repeat(20) })).toThrow(/peu varié/);
  });
  it('TRUST_PROXY : false par défaut, nombre de sauts, liste d’adresses ; « true » refusé', () => {
    expect(loadConfig(base).trustProxy).toBe(false);
    expect(loadConfig({ ...base, TRUST_PROXY: '1' }).trustProxy).toBe(1);
    expect(loadConfig({ ...base, TRUST_PROXY: 'loopback, 10.0.0.0/8' }).trustProxy).toBe('loopback, 10.0.0.0/8');
    expect(() => loadConfig({ ...base, TRUST_PROXY: 'true' })).toThrow(/TRUST_PROXY/);
  });
  it('consentTextVersion : base par défaut, suffixe -r<N> si la rétention n’est pas 12 mois', () => {
    expect(loadConfig(base).consentTextVersion).toBe('2026-10');
    expect(loadConfig({ ...base, RETENTION_MONTHS: '12' }).consentTextVersion).toBe('2026-10');
    expect(loadConfig({ ...base, RETENTION_MONTHS: '24', CONSENT_TEXT_VERSION: '2027-01' }).consentTextVersion).toBe('2027-01-r24');
  });
});

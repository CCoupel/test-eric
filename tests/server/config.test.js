import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../../src/server/config.js';

const base = { DATABASE_URL: 'postgres://u:p@localhost:5432/db' };

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
    expect(() => loadConfig({ DATABASE_URL: 'mysql://x' })).toThrow(/postgres/);
  });
});

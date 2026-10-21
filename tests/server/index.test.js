import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../../src/server/config.js';
import { start } from '../../src/server/index.js';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('start() — démarrage / arrêt', () => {
  it('migre, écoute sur un port libre, répond à /health puis s’arrête proprement', async () => {
    const log = { log: vi.fn(), error: vi.fn() };
    const config = loadConfig({ DATABASE_URL: url, NODE_ENV: 'test', APP_PORT: '0' });
    const { server, stop } = await start(config, log);
    const res = await request(`http://127.0.0.1:${server.address().port}`).get('/health');
    expect(res.body).toMatchObject({ status: 'ok', db: 'ok' });
    await stop();
    expect(server.listening).toBe(false);
  });

  it('rejette si le port est déjà occupé', async () => {
    const config = loadConfig({ DATABASE_URL: url, NODE_ENV: 'test', APP_PORT: '0' });
    const first = await start(config, console);
    const busy = loadConfig({ DATABASE_URL: url, NODE_ENV: 'test', APP_PORT: String(first.server.address().port) });
    await expect(start(busy, console)).rejects.toThrow(/EADDRINUSE/);
    await first.stop();
  });

  it('avertit au démarrage en production HTTPS sans TRUST_PROXY, pas avec TRUST_PROXY', async () => {
    const prod = { DATABASE_URL: url, NODE_ENV: 'production', APP_PORT: '0', APP_BASE_URL: 'https://club.example', SESSION_SECRET: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6' };
    const warn = vi.fn();
    const a = await start(loadConfig(prod), { log: vi.fn(), warn, error: vi.fn() });
    await a.stop();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('TRUST_PROXY'));
    const warn2 = vi.fn();
    const b = await start(loadConfig({ ...prod, TRUST_PROXY: '1' }), { log: vi.fn(), warn: warn2, error: vi.fn() });
    await b.stop();
    expect(warn2).not.toHaveBeenCalledWith(expect.stringContaining('TRUST_PROXY'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('SMTP non configuré')); // production sans SMTP : avertissement explicite
  });
});

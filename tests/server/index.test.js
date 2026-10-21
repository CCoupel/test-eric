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
});

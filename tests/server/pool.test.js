import { describe, expect, it, vi } from 'vitest';
import { createPool } from '../../src/server/db/pool.js';

describe('createPool', () => {
  it('journalise une erreur de client inactif sans planter', async () => {
    const log = { error: vi.fn() };
    const pool = createPool({ databaseUrl: 'postgres://x@127.0.0.1:1/x' }, log);
    const err = Object.assign(new Error('connexion perdue'), { code: 'ECONNRESET', client: { secret: 'x' } });
    expect(() => pool.emit('error', err)).not.toThrow();
    expect(log.error).toHaveBeenCalledWith({ message: 'connexion perdue', code: 'ECONNRESET' }, expect.stringContaining('pool'));
    await pool.end();
  });
});

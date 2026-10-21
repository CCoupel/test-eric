import { describe, expect, it, vi } from 'vitest';
import { createPool } from '../../src/server/db/pool.js';

describe('createPool', () => {
  it('journalise une erreur de client inactif sans planter', async () => {
    const log = { error: vi.fn() };
    const pool = createPool({ databaseUrl: 'postgres://x@127.0.0.1:1/x' }, log);
    const err = new Error('connexion perdue');
    expect(() => pool.emit('error', err)).not.toThrow();
    expect(log.error).toHaveBeenCalledWith({ err }, expect.stringContaining('pool'));
    await pool.end();
  });
});

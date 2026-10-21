import { describe, expect, it } from 'vitest';
import { FailureLimiter } from '../../src/server/middleware/failure-limiter.js';

describe('FailureLimiter', () => {
  const make = (over = {}) => {
    const clock = { t: 0 };
    return { clock, lim: new FailureLimiter({ limit: 3, windowMs: 1000, now: () => clock.t, ...over }) };
  };

  it('bloque au bout de `limit` échecs, par clé indépendante', () => {
    const { lim } = make();
    for (let i = 0; i < 2; i++) lim.fail('a');
    expect(lim.isBlocked('a')).toBe(false);
    lim.fail('a');
    expect(lim.isBlocked('a')).toBe(true);
    expect(lim.isBlocked('b')).toBe(false);
  });
  it('la fenêtre expire ; reset efface', () => {
    const { lim, clock } = make();
    for (let i = 0; i < 3; i++) lim.fail('a');
    clock.t = 1001;
    expect(lim.isBlocked('a')).toBe(false);
    for (let i = 0; i < 3; i++) lim.fail('a');
    lim.reset('a');
    expect(lim.isBlocked('a')).toBe(false);
  });
  it('mémoire bornée : au-delà de maxKeys les plus anciennes entrées sont évincées', () => {
    const { lim } = make({ maxKeys: 5 });
    for (let i = 0; i < 20; i++) lim.fail(`k${i}`);
    expect(lim.entries.size).toBeLessThanOrEqual(5);
    expect(lim.isBlocked('k19')).toBe(false);
  });
});

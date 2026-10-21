import { describe, expect, it } from 'vitest';
import { assertSafeToReset } from './db-guard.js';

describe('assertSafeToReset', () => {
  it('accepte une base finissant par _test', () => {
    expect(() => assertSafeToReset('postgres://u:p@localhost:5433/club_test', {})).not.toThrow();
  });
  it('refuse une autre base avec un message explicite', () => {
    expect(() => assertSafeToReset('postgres://u:p@localhost/club', {})).toThrow(/ne finit pas par _test/);
  });
  it('accepte une base quelconque avec ALLOW_DB_RESET=1', () => {
    expect(() => assertSafeToReset('postgres://u:p@localhost/club', { ALLOW_DB_RESET: '1' })).not.toThrow();
  });
  it('refuse une URL illisible', () => {
    expect(() => assertSafeToReset('pas une url', {})).toThrow(/illisible/);
  });
});

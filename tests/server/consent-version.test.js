import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/server/config.js';
import { consentText } from '../../src/server/consent.js';

// Garde-fou : le texte de consentement accepté est tracé par CONSENT_TEXT_VERSION. Si ce test échoue, le texte de consent.js a changé :
// incrémenter la version par défaut dans config.js (ex. '2026-11'), la valeur de référence ci-dessous, et le CHANGELOG des contrats.
const TEXT_SHA256 = '2c9011c3e16360fed82564c5b876abba0962b546dd517390d658f00dd3eb1978';
const base = { DATABASE_URL: 'postgres://x@localhost/x', SESSION_SECRET: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6' };

describe('version du texte de consentement', () => {
  it('le texte par défaut correspond à la version 2026-10 (modifier le texte impose de changer la version)', () => {
    const config = loadConfig(base);
    expect(config.consentTextVersion).toBe('2026-10');
    const hash = createHash('sha256').update(consentText(config)).digest('hex');
    expect(hash, `texte modifié (sha256 ${hash}) sans changement de version`).toBe(TEXT_SHA256);
  });
  it('la durée de conservation fait partie du texte : elle change la version effective', () => {
    expect(consentText(loadConfig({ ...base, RETENTION_MONTHS: '24' }))).toContain('24 mois');
    expect(loadConfig({ ...base, RETENTION_MONTHS: '24' }).consentTextVersion).not.toBe('2026-10');
  });
});

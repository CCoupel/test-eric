import { describe, expect, it } from 'vitest';
import { mailingStatusLabel } from './MailingStatusBadge';

const m = (over: object) => ({ status: 'sent' as const, transport: 'smtp' as const, sent_count: 12, recipients_count: 12, ...over });

describe('mailingStatusLabel', () => {
  it('envoyé', () => expect(mailingStatusLabel(m({})).text).toBe('Envoyé 12/12'));
  it('partiel', () => expect(mailingStatusLabel(m({ status: 'partial', sent_count: 11 })).text).toBe('Partiel 11/12'));
  it('échec', () => expect(mailingStatusLabel(m({ status: 'failed', sent_count: 0 })).text).toBe('Échec 0/12'));
  it('simulé en stub', () => expect(mailingStatusLabel(m({ transport: 'stub' })).text).toContain('Simulé'));
  it('en cours', () => expect(mailingStatusLabel(m({ status: 'sending' })).text).toContain('en cours'));
});

import type { Mailing } from '../api/mailings';

export function mailingStatusLabel(m: Pick<Mailing, 'status' | 'transport' | 'sent_count' | 'recipients_count'>): { text: string; cls: string } {
  const ratio = `${m.sent_count}/${m.recipients_count}`;
  if (m.status === 'sending') return { text: 'Envoi en cours…', cls: 'b-stub' };
  if (m.transport === 'stub') return { text: 'Simulé (SMTP non configuré)', cls: 'b-stub' };
  if (m.status === 'sent') return { text: `Envoyé ${ratio}`, cls: 'b-sent' };
  if (m.status === 'partial') return { text: `Partiel ${ratio}`, cls: 'b-partial' };
  return { text: `Échec ${ratio}`, cls: 'b-failed' };
}

export function MailingStatusBadge({ mailing }: { mailing: Mailing }) {
  const { text, cls } = mailingStatusLabel(mailing);
  return (
    <span className={`badge ${cls}`} data-testid="mailing-status-badge">
      {text}
    </span>
  );
}

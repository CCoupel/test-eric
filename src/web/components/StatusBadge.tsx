import type { ActivityStatus } from '../api/activities';

const LABELS: Record<ActivityStatus, string> = { draft: 'Brouillon', open: 'Ouverte', closed: 'Fermée' };

export function StatusBadge({ status }: { status: ActivityStatus }) {
  return (
    <span className={`badge b-${status}`} data-testid="activity-status-badge">
      {LABELS[status]}
    </span>
  );
}

import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { activitiesApi, type Activity, type ActivityStatus } from '../api/activities';
import { StatusBadge } from '../components/StatusBadge';
import { formatDateTime, formatPlaces } from '../components/format';

export function ActivitiesPage() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<ActivityStatus | ''>('');
  const [activities, setActivities] = useState<Activity[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    activitiesApi
      .list(filter || undefined)
      .then((a) => {
        if (!active) return;
        setError(null);
        setActivities(a);
      })
      .catch((e: unknown) => active && setError(e instanceof Error ? e.message : 'Erreur'));
    return () => {
      active = false;
    };
  }, [filter]);

  return (
    <section className="screen">
      <div className="row between">
        <h1>Activités</h1>
        <div className="row">
          <select className="btn" aria-label="Filtrer par statut" data-testid="activity-filter" value={filter} onChange={(e) => setFilter(e.target.value as ActivityStatus | '')}>
            <option value="">Toutes</option>
            <option value="draft">Brouillons</option>
            <option value="open">Ouvertes</option>
            <option value="closed">Fermées</option>
          </select>
          <button type="button" className="btn primary" data-testid="activity-new-button" onClick={() => navigate('/activities/new')}>
            + Nouvelle activité
          </button>
        </div>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {!error && activities === null && <p>Chargement…</p>}
      {activities?.length === 0 && <p className="hint">Aucune activité pour l’instant. Créez la première !</p>}
      {activities && activities.length > 0 && (
        <table>
          <thead>
            <tr><th>Activité</th><th>Date</th><th>Lieu</th><th>Inscrits</th><th>Statut</th></tr>
          </thead>
          <tbody>
            {activities.map((a) => (
              <tr key={a.id} data-testid="activity-row">
                <td><Link to={`/activities/${a.id}`}>{a.title}</Link></td>
                <td>{formatDateTime(a.starts_at)}</td>
                <td>{a.location}</td>
                <td>{formatPlaces(a.registrations_count, a.capacity)}</td>
                <td><StatusBadge status={a.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

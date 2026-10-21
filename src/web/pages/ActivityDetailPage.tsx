import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { activitiesApi, type Activity, type Registration } from '../api/activities';
import { ApiError } from '../api/client';
import { ActivityForm } from '../components/ActivityForm';
import { StatusBadge } from '../components/StatusBadge';
import { formatDate, formatDateTime } from '../components/format';

export function ActivityDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [activity, setActivity] = useState<Activity | null>(null);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([activitiesApi.get(id), activitiesApi.registrations(id)])
      .then(([a, r]) => {
        if (!active) return;
        setActivity(a);
        setRegistrations(r.registrations);
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof ApiError && err.status === 404) setNotFound(true);
        else setError(err instanceof Error ? err.message : 'Erreur');
      });
    return () => {
      active = false;
    };
  }, [id]);

  async function run(action: () => Promise<Activity>) {
    setError(null);
    try {
      setActivity(await action());
    } catch (err) {
      setError(err instanceof ApiError && err.subCode === 'invalid_transition' ? 'Cette action n’est plus possible : rechargez la page.' : err instanceof Error ? err.message : 'Erreur');
    }
  }

  async function onDelete() {
    if (!activity || !window.confirm(`Supprimer « ${activity.title} » ?`)) return;
    setError(null);
    try {
      await activitiesApi.remove(activity.id);
      navigate('/activities');
    } catch (err) {
      setError(err instanceof ApiError && err.subCode === 'has_registrations' ? 'Suppression impossible : des personnes sont inscrites.' : err instanceof Error ? err.message : 'Erreur');
    }
  }

  async function onCopy() {
    if (!activity) return;
    try {
      await navigator.clipboard.writeText(activity.public_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Copie impossible : sélectionnez le lien manuellement.');
    }
  }

  if (notFound) return <p className="error" role="alert">Activité introuvable.</p>;
  if (!activity) return error ? <p className="error" role="alert">{error}</p> : <p>Chargement…</p>;

  const canDelete = activity.status === 'draft' || activity.registrations_count === 0;

  return (
    <section className="screen">
      <div className="row between">
        <h1>
          {activity.title} <StatusBadge status={activity.status} />
        </h1>
        <div className="row">
          {!editing && <button type="button" className="btn" data-testid="activity-edit-button" onClick={() => setEditing(true)}>Modifier</button>}
          {activity.status === 'open' && (
            <button type="button" className="btn warn" data-testid="activity-close-button" onClick={() => void run(() => activitiesApi.close(activity.id))}>
              Fermer les inscriptions
            </button>
          )}
          {activity.status !== 'open' && (
            <button type="button" className="btn ok" data-testid="activity-open-button" onClick={() => void run(() => activitiesApi.open(activity.id))}>
              {activity.status === 'draft' ? 'Ouvrir aux inscriptions' : 'Rouvrir'}
            </button>
          )}
          {canDelete && (
            <button type="button" className="btn danger" data-testid="activity-delete-button" onClick={() => void onDelete()}>Supprimer</button>
          )}
        </div>
      </div>
      {error && <p className="error" role="alert">{error}</p>}

      {editing ? (
        <ActivityForm
          activity={activity}
          submitLabel="Enregistrer"
          onSubmit={async (input) => {
            setActivity(await activitiesApi.update(activity.id, input));
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <>
          <p className="hint">
            {formatDateTime(activity.starts_at)} · {activity.location} · {activity.capacity ?? 'places illimitées'}
            {activity.capacity != null ? ' places' : ''} · créée par {activity.owner.name}
          </p>
          {activity.description && <p>{activity.description}</p>}
        </>
      )}

      {activity.status !== 'draft' && (
        <>
          <h2>Lien d’inscription à partager</h2>
          <div className="row">
            <div className="link" data-testid="activity-public-link">{activity.public_url}</div>
            <button type="button" className="btn" data-testid="activity-copy-link" onClick={() => void onCopy()}>
              {copied ? 'Copié !' : 'Copier'}
            </button>
          </div>
        </>
      )}

      <h2>
        Inscrits — {activity.registrations_count}
        {activity.capacity != null ? ` / ${activity.capacity} (${activity.remaining_places ?? 0} places restantes)` : ''}
      </h2>
      {registrations.length === 0 ? (
        <p className="hint" data-testid="registrations-empty">Personne n’est encore inscrit. Partagez le lien ci-dessus.</p>
      ) : (
        <table>
          <thead>
            <tr><th>Participant</th><th>Contact</th><th>E-mail</th><th>Inscrit le</th></tr>
          </thead>
          <tbody>
            {registrations.map((r) => (
              <tr key={r.id}>
                <td>{r.participant_name} {r.is_minor && <span className="badge b-draft">mineur</span>}</td>
                <td>{r.is_minor ? `${r.contact_name} (parent)` : '—'}</td>
                <td>{r.contact_email}</td>
                <td>{formatDate(r.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

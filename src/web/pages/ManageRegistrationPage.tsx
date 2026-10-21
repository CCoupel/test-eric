import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { publicApi } from '../api/public';
import { ApiError } from '../api/client';
import { PublicLayout } from '../components/PublicLayout';
import { formatDateTime } from '../components/format';

type Data = Awaited<ReturnType<typeof publicApi.registration>>;

export function ManageRegistrationPage() {
  const { token = '' } = useParams();
  const [data, setData] = useState<Data | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'notfound' | 'error' | 'deleted'>('loading');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    publicApi
      .registration(token)
      .then((r) => {
        if (!active) return;
        setData(r);
        setState('ready');
      })
      .catch((err: unknown) => {
        if (!active) return;
        setState(err instanceof ApiError && err.status === 404 ? 'notfound' : 'error');
      });
    return () => {
      active = false;
    };
  }, [token]);

  async function unregister() {
    setBusy(true);
    setError(null);
    try {
      await publicApi.unregister(token);
      setData(null);
      setState('deleted');
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setData(null);
        setState('notfound');
      } else {
        setError('La désinscription a échoué. Réessayez.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <PublicLayout>
      <section className="screen">
        {state === 'loading' && <p>Chargement…</p>}
        {state === 'error' && <p className="error" role="alert">Impossible de charger votre inscription. Réessayez plus tard.</p>}
        {state === 'notfound' && (
          <>
            <h1 data-testid="manage-not-found">Inscription introuvable</h1>
            <p className="hint">Ce lien est inconnu ou a déjà été utilisé.</p>
          </>
        )}
        {state === 'deleted' && (
          <>
            <h1 data-testid="manage-unregistered">Vous êtes désinscrit.</h1>
            <p className="hint">Vos données ont été supprimées.</p>
          </>
        )}
        {state === 'ready' && data && (
          <>
            <h1>Mon inscription</h1>
            <p data-testid="manage-participant-name">
              <strong>{data.registration.participant_name}</strong>
              {data.registration.is_minor && ` (contact : ${data.registration.contact_name}, ${data.registration.contact_email})`}
              {!data.registration.is_minor && ` (${data.registration.contact_email})`}
            </p>
            <p className="meta">
              {data.activity.title} · {formatDateTime(data.activity.starts_at)} · {data.activity.location}
            </p>
            <h2>Me désinscrire</h2>
            <p className="hint">
              La désinscription supprime définitivement vos données personnelles (nom, e-mail) pour cette activité. Vous pourrez vous réinscrire tant que l’activité est ouverte.
            </p>
            {error && <p className="error" role="alert">{error}</p>}
            {!confirming ? (
              <button type="button" className="btn danger" data-testid="manage-unregister" onClick={() => setConfirming(true)}>
                Me désinscrire et supprimer mes données
              </button>
            ) : (
              <div role="group" aria-label="Confirmation de désinscription">
                <p><strong>Confirmer la désinscription ? Cette action est définitive.</strong></p>
                <div className="row">
                  <button type="button" className="btn danger" data-testid="manage-unregister-confirm" disabled={busy} onClick={() => void unregister()}>
                    Oui, me désinscrire
                  </button>
                  <button type="button" className="btn" onClick={() => setConfirming(false)}>Annuler</button>
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </PublicLayout>
  );
}

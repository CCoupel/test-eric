import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { unsubscribeApi } from '../api/mailings';
import { ApiError } from '../api/client';
import { PublicLayout } from '../components/PublicLayout';
import { formatDateTime } from '../components/format';

type Info = Awaited<ReturnType<typeof unsubscribeApi.info>>;

export function UnsubscribePage() {
  const { token = '' } = useParams();
  const [info, setInfo] = useState<Info | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'notfound' | 'error' | 'done'>('loading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    // GET non mutant : la page n'agit qu'après confirmation explicite (les antivirus/aperçus de liens ouvrent les URL).
    unsubscribeApi
      .info(token)
      .then((i) => {
        if (!active) return;
        setInfo(i);
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

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await unsubscribeApi.confirm(token);
      setInfo(null);
      setState('done');
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setInfo(null);
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
        {state === 'error' && <p className="error" role="alert">Impossible de charger cette page. Réessayez plus tard.</p>}
        {state === 'notfound' && (
          <>
            <h1 data-testid="unsubscribe-not-found">Lien introuvable</h1>
            <p className="hint">Ce lien est inconnu ou a déjà été utilisé.</p>
          </>
        )}
        {state === 'done' && (
          <>
            <h1 data-testid="unsubscribe-done">Vous êtes désinscrit.</h1>
            <p className="hint">Vos données ont été supprimées. Vous ne recevrez plus d’e-mails pour ces activités.</p>
          </>
        )}
        {state === 'ready' && info && (
          <>
            <h1>Se désinscrire</h1>
            <p>Vous allez être désinscrit des activités suivantes et vos données personnelles seront supprimées :</p>
            <ul>
              {info.activities.map((a, i) => (
                <li key={i}>{a.title} — {formatDateTime(a.starts_at)}</li>
              ))}
            </ul>
            {error && <p className="error" role="alert">{error}</p>}
            <button type="button" className="btn danger" data-testid="unsubscribe-confirm" disabled={busy} onClick={() => void confirm()}>
              Confirmer la désinscription
            </button>
          </>
        )}
      </section>
    </PublicLayout>
  );
}

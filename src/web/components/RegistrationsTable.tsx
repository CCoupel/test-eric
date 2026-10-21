import { useState } from 'react';
import type { Registration } from '../api/activities';
import { formatDate } from './format';

interface Props {
  registrations: Registration[];
  onRemove: (registrationId: string) => Promise<void>;
}

export function RegistrationsTable({ registrations, onRemove }: Props) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove(id: string) {
    setBusy(true);
    setError(null);
    try {
      await onRemove(id);
      setConfirmId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Suppression impossible.');
    } finally {
      setBusy(false);
    }
  }

  if (registrations.length === 0) {
    return <p className="hint" data-testid="registrations-empty">Personne n’est encore inscrit. Partagez le lien ci-dessus.</p>;
  }

  return (
    <>
      {error && <p className="error" role="alert">{error}</p>}
      <table>
        <thead>
          <tr><th>Participant</th><th>Contact</th><th>E-mail</th><th>Inscrit le</th><th><span className="sr-only">Actions</span></th></tr>
        </thead>
        <tbody>
          {registrations.map((r) => (
            <tr key={r.id} data-testid="registration-row">
              <td>{r.participant_name} {r.is_minor && <span className="badge b-draft">mineur</span>}</td>
              <td>{r.is_minor ? `${r.contact_name} (parent)` : '—'}</td>
              <td>{r.contact_email}</td>
              <td>{formatDate(r.created_at)}</td>
              <td>
                {confirmId === r.id ? (
                  <div role="group" aria-label={`Confirmer le retrait de ${r.participant_name}`}>
                    <p className="error">Retirer {r.participant_name} supprime définitivement ses données personnelles (nom, e-mail). Confirmer ?</p>
                    <div className="row">
                      <button type="button" className="btn danger" data-testid="registration-remove-confirm" disabled={busy} onClick={() => void remove(r.id)}>
                        Oui, retirer et supprimer
                      </button>
                      <button type="button" className="btn" data-testid="registration-remove-cancel" disabled={busy} onClick={() => setConfirmId(null)}>Annuler</button>
                    </div>
                  </div>
                ) : (
                  <button type="button" className="btn danger" data-testid="registration-remove" aria-label={`Retirer ${r.participant_name}`} onClick={() => setConfirmId(r.id)}>
                    Retirer
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

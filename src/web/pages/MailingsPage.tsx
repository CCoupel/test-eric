import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { mailingsApi, type Mailing } from '../api/mailings';
import { MailingStatusBadge } from '../components/MailingStatusBadge';
import { formatDateTime } from '../components/format';

export function MailingsPage() {
  const navigate = useNavigate();
  const [mailings, setMailings] = useState<Mailing[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    mailingsApi
      .list()
      .then((m) => active && setMailings(m))
      .catch((e: unknown) => active && setError(e instanceof Error ? e.message : 'Erreur'));
    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="screen">
      <div className="row between">
        <h1>E-mails envoyés</h1>
        <button type="button" className="btn primary" data-testid="mailing-new-button" onClick={() => navigate('/mailings/new')}>
          + Nouvel e-mail
        </button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {!error && mailings === null && <p>Chargement…</p>}
      {mailings?.length === 0 && <p className="hint">Aucun e-mail envoyé pour l’instant.</p>}
      {mailings && mailings.length > 0 && (
        <table>
          <thead>
            <tr><th>Date</th><th>Objet</th><th>Activités</th><th>Destinataires</th><th>Par</th><th>Statut</th></tr>
          </thead>
          <tbody>
            {mailings.map((m) => (
              <tr key={m.id} data-testid="mailing-row">
                <td>{formatDateTime(m.created_at)}</td>
                <td><Link to={`/mailings/${m.id}`}>{m.subject}</Link></td>
                <td>{m.activities.map((a) => a.title).join(', ')}</td>
                <td>{m.recipients_count}</td>
                <td>{m.sender.name}</td>
                <td><MailingStatusBadge mailing={m} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

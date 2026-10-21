import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { mailingsApi, type Mailing, type MailingRecipient } from '../api/mailings';
import { ApiError } from '../api/client';
import { MailingStatusBadge } from '../components/MailingStatusBadge';
import { formatDateTime } from '../components/format';

const RECIPIENT_LABELS: Record<string, { text: string; cls: string }> = {
  sent: { text: 'envoyé', cls: 'b-sent' },
  stubbed: { text: 'simulé', cls: 'b-stub' },
  failed: { text: 'échec', cls: 'b-failed' },
  pending: { text: 'en attente', cls: 'b-stub' },
};

const ERROR_LABELS: Record<string, string> = {
  timeout: 'délai dépassé',
  connection: 'connexion impossible',
  auth: 'authentification refusée',
  rejected: 'adresse refusée',
  other: 'erreur',
};

const POLL_MS = 2000;

export function MailingDetailPage() {
  const { id = '' } = useParams();
  const [data, setData] = useState<{ mailing: Mailing; recipients: MailingRecipient[] } | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sending = data?.mailing.status === 'sending';

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = () => {
      mailingsApi
        .get(id)
        .then((d) => {
          if (!active) return;
          setData(d);
          if (d.mailing.status === 'sending') timer = setTimeout(load, POLL_MS);
        })
        .catch((err: unknown) => {
          if (!active) return;
          if (err instanceof ApiError && err.status === 404) setNotFound(true);
          else setError(err instanceof Error ? err.message : 'Erreur');
        });
    };
    load();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [id]);

  if (notFound) return <p className="error" role="alert">Envoi introuvable.</p>;
  if (!data) return error ? <p className="error" role="alert">{error}</p> : <p>Chargement…</p>;
  const { mailing, recipients } = data;

  return (
    <section className="screen">
      <p><Link to="/mailings">← Historique</Link></p>
      <h1>
        {mailing.subject} <MailingStatusBadge mailing={mailing} />
      </h1>
      <p className="hint">
        Envoyé le {formatDateTime(mailing.created_at)} par {mailing.sender.name} · Activités : {mailing.activities.map((a) => a.title).join(', ')} · Transport :{' '}
        {mailing.transport === 'stub' ? 'simulé' : 'SMTP'}
      </p>
      {sending && <p role="status">Envoi en cours… cette page se met à jour automatiquement.</p>}
      <h2>Message</h2>
      <div className="preview"><pre data-testid="mailing-body-text">{mailing.body}</pre></div>
      <h2>Destinataires ({recipients.length})</h2>
      <table>
        <thead>
          <tr><th>E-mail</th><th>Statut</th><th>Détail</th></tr>
        </thead>
        <tbody>
          {recipients.map((r, i) => {
            const st = RECIPIENT_LABELS[r.status] ?? { text: r.status, cls: 'b-stub' };
            return (
              <tr key={i} data-testid="mailing-detail-recipient">
                <td>{r.email ?? <em className="hint">désinscrit depuis</em>}</td>
                <td><span className={`badge ${st.cls}`}>{st.text}</span></td>
                <td>{r.error ? (ERROR_LABELS[r.error] ?? r.error) : r.sent_at ? formatDateTime(r.sent_at) : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

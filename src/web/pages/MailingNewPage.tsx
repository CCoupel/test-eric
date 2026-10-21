import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { activitiesApi, type Activity } from '../api/activities';
import { ApiError } from '../api/client';
import { mailingsApi, type RecipientsPreview } from '../api/mailings';

export function mailingErrorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return 'Erreur inattendue.';
  switch (err.subCode) {
    case 'no_recipients':
      return 'Aucun destinataire pour cette sélection.';
    case 'too_many_recipients':
      return 'Trop de destinataires pour un seul envoi : réduisez la sélection.';
    case 'mailing_in_progress':
      return 'Un envoi est déjà en cours. Attendez sa fin avant d’en lancer un autre.';
    case 'duplicate_mailing':
      return 'Cet e-mail identique vient d’être envoyé. Patientez quelques minutes avant de le renvoyer.';
    case 'rate_limited':
      return 'Trop d’envois récents, réessayez dans quelques minutes.';
    case 'validation_error':
      return err.details.length > 0 ? err.details.map((d) => d.message).join(' · ') : 'Vérifiez l’objet et le message.';
    default:
      return err.message;
  }
}

export function MailingNewPage() {
  const navigate = useNavigate();
  const [activities, setActivities] = useState<Activity[] | null>(null);
  const [stub, setStub] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [preview, setPreview] = useState<{ key: string; data: RecipientsPreview } | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [errors, setErrors] = useState<{ subject?: string; body?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let active = true;
    activitiesApi
      .list()
      .then((a) => active && setActivities(a))
      .catch((e: unknown) => active && setFormError(e instanceof Error ? e.message : 'Erreur'));
    mailingsApi
      .mailStatus()
      .then((s) => active && setStub(s.transport === 'stub'))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const key = useMemo(() => [...selected].sort().join(','), [selected]);

  useEffect(() => {
    if (selected.length === 0) return;
    let active = true;
    mailingsApi
      .preview(selected)
      .then((data) => active && setPreview({ key, data }))
      .catch((e: unknown) => active && setFormError(mailingErrorMessage(e)));
    return () => {
      active = false;
    };
  }, [key, selected]);

  const count = selected.length > 0 && preview?.key === key ? preview.data.recipients_count : null;
  const canSubmit = !sending && selected.length > 0 && count != null && count > 0;

  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const found: typeof errors = {};
    if (!subject.trim()) found.subject = 'Objet requis';
    else if (subject.length > 200) found.subject = '200 caractères maximum';
    if (!body.trim()) found.body = 'Message requis';
    else if (body.length > 20000) found.body = '20 000 caractères maximum';
    setErrors(found);
    if (Object.keys(found).length > 0 || !canSubmit) return;
    setSending(true);
    try {
      const m = await mailingsApi.create({ activity_ids: selected, subject: subject.trim(), body });
      navigate(`/mailings/${m.id}`);
    } catch (err) {
      setFormError(mailingErrorMessage(err));
      setSending(false);
    }
  }

  return (
    <section className="screen narrow">
      <h1>Nouvel e-mail aux inscrits</h1>
      {stub && (
        <div className="banner warn" data-testid="mailing-stub-banner" role="status">
          ⚠ L’envoi d’e-mails n’est pas configuré (SMTP). L’envoi sera <strong>simulé</strong> et enregistré dans l’historique sans partir.
        </div>
      )}
      <form onSubmit={(e) => void submit(e)} noValidate>
        <h2>Destinataires : inscrits de…</h2>
        {activities === null && <p>Chargement…</p>}
        {activities?.length === 0 && <p className="hint">Aucune activité : créez-en une d’abord.</p>}
        {activities?.map((a) => (
          <div className="check" key={a.id} data-testid="mailing-activity">
            <input id={`act-${a.id}`} type="checkbox" checked={selected.includes(a.id)} onChange={() => toggle(a.id)} />
            <label htmlFor={`act-${a.id}`}>
              {a.title} <span className="hint">— {a.registrations_count} inscrit{a.registrations_count > 1 ? 's' : ''}{a.status === 'closed' ? ' (fermée)' : a.status === 'draft' ? ' (brouillon)' : ''}</span>
            </label>
          </div>
        ))}
        <p className="hint" data-testid="mailing-recipients-preview" aria-live="polite">
          {selected.length === 0
            ? 'Cochez au moins une activité.'
            : count == null
              ? 'Calcul des destinataires…'
              : `${count} destinataire${count > 1 ? 's' : ''} unique${count > 1 ? 's' : ''} (les doublons entre activités sont regroupés). Chaque personne reçoit son propre message : les adresses ne sont jamais visibles des autres.`}
        </p>

        <label htmlFor="mail-subject">Objet *</label>
        <input id="mail-subject" data-testid="mailing-subject" maxLength={200} value={subject} onChange={(e) => setSubject(e.target.value)} aria-invalid={!!errors.subject} />
        {errors.subject && <p className="error">{errors.subject}</p>}
        <label htmlFor="mail-body">Message *</label>
        <textarea id="mail-body" data-testid="mailing-body" rows={6} value={body} onChange={(e) => setBody(e.target.value)} aria-invalid={!!errors.body} />
        {errors.body && <p className="error">{errors.body}</p>}

        {formError && <p className="error" role="alert">{formError}</p>}
        <div className="row" style={{ marginTop: 14 }}>
          <button type="submit" className="btn primary" data-testid="mailing-submit" disabled={!canSubmit}>
            {sending ? 'Envoi en cours…' : `Envoyer à ${count ?? 0} destinataire${(count ?? 0) > 1 ? 's' : ''}`}
          </button>
          <button type="button" className="btn" onClick={() => navigate('/mailings')}>Annuler</button>
        </div>
        <p className="hint">L’envoi peut prendre quelques secondes. Le message est envoyé en texte brut.</p>
      </form>
    </section>
  );
}

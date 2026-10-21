import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { publicApi, type PublicActivity, type RegistrationInput } from '../api/public';
import { ApiError } from '../api/client';
import { PublicLayout } from '../components/PublicLayout';
import { formatDateTime, formatLongDateTime } from '../components/format';

type Loaded = { activity: PublicActivity; consentText: string; started: boolean };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function errorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return 'Erreur inattendue.';
  switch (err.subCode) {
    case 'activity_full':
      return 'Cette activité est complète.';
    case 'activity_closed':
      return 'Les inscriptions sont fermées.';
    case 'already_registered':
      return 'Vous êtes déjà inscrit à cette activité.';
    case 'rate_limited':
      return 'Trop de tentatives. Réessayez dans un moment.';
    case 'network_error':
      return err.message;
    case 'not_found':
      return 'Activité introuvable.';
    case 'validation_error':
      return err.details.length > 0 ? err.details.map((d) => d.message).join(' · ') : 'Vérifiez les champs du formulaire.';
    default:
      return 'Une erreur est survenue. Réessayez plus tard.';
  }
}

export function PublicActivityPage() {
  const { slug = '' } = useParams();
  const [data, setData] = useState<Loaded | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [done, setDone] = useState<{ manageUrl: string; participant: string } | null>(null);

  useEffect(() => {
    let active = true;
    publicApi
      .activity(slug)
      .then((r) => active && setData({ activity: r.activity, consentText: r.consent_text, started: new Date(r.activity.starts_at).getTime() <= Date.now() }))
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof ApiError && err.status === 404) setNotFound(true);
        else setLoadError(errorMessage(err));
      });
    return () => {
      active = false;
    };
  }, [slug]);

  if (notFound)
    return (
      <PublicLayout>
        <section className="screen">
          <h1 data-testid="public-not-found">Activité introuvable</h1>
          <p className="hint">Ce lien n’est pas valide ou l’activité n’est plus disponible.</p>
        </section>
      </PublicLayout>
    );
  if (loadError)
    return (
      <PublicLayout>
        <p className="error" role="alert">{loadError}</p>
      </PublicLayout>
    );
  if (!data)
    return (
      <PublicLayout>
        <p>Chargement…</p>
      </PublicLayout>
    );

  const { activity } = data;
  const closed = activity.status === 'closed' || data.started;
  const full = !closed && activity.is_full;

  return (
    <PublicLayout>
      <section className="screen">
        {done ? (
          <Confirmation activity={activity} manageUrl={done.manageUrl} participant={done.participant} />
        ) : (
          <>
            <h1 data-testid="public-activity-title">{activity.title}</h1>
            <p className="meta">{formatLongDateTime(activity.starts_at)} · {activity.location}</p>
            {activity.description && <p>{activity.description}</p>}
            {closed && <p className="full" data-testid="public-activity-closed">Les inscriptions sont fermées.</p>}
            {full && (
              <p className="full" data-testid="public-activity-full">
                Cette activité est complète{activity.capacity != null ? ` (${activity.capacity}/${activity.capacity})` : ''}.
              </p>
            )}
            {!closed && !full && activity.remaining_places != null && (
              <p className="places" data-testid="public-places">
                {activity.remaining_places} place{activity.remaining_places > 1 ? 's' : ''} restante{activity.remaining_places > 1 ? 's' : ''}
              </p>
            )}
            {!closed && !full && (
              <RegistrationForm
                slug={slug}
                consentText={data.consentText}
                onDone={(manageUrl, participant) => setDone({ manageUrl, participant })}
                onClosed={() => setData((d) => (d ? { ...d, activity: { ...d.activity, status: 'closed' } } : d))}
              />
            )}
          </>
        )}
      </section>
    </PublicLayout>
  );
}

function Confirmation({ activity, manageUrl, participant }: { activity: PublicActivity; manageUrl: string; participant: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(manageUrl);
      setCopied(true);
    } catch {
      /* le lien reste sélectionnable à l'écran */
    }
  }
  return (
    <div data-testid="register-confirmation">
      <h1>Inscription confirmée ✔</h1>
      <p>
        <strong>{participant}</strong> est inscrit à <strong>{activity.title}</strong> ({formatDateTime(activity.starts_at)}, {activity.location}).
      </p>
      <h2>Conservez ce lien</h2>
      <div className="box" data-testid="register-manage-url">{manageUrl}</div>
      <p className="hint">
        Il permet de vous désinscrire et de supprimer vos données. Il n’est affiché qu’une seule fois : notez-le ou copiez-le maintenant.
      </p>
      <button type="button" className="btn" onClick={() => void copy()}>{copied ? 'Copié !' : 'Copier le lien'}</button>
    </div>
  );
}

function RegistrationForm({
  slug,
  consentText,
  onDone,
  onClosed,
}: {
  slug: string;
  consentText: string;
  onDone: (manageUrl: string, participant: string) => void;
  onClosed: () => void;
}) {
  const [minor, setMinor] = useState(true);
  const [participant, setParticipant] = useState('');
  const [contact, setContact] = useState('');
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [honeypot, setHoneypot] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const found: Record<string, string> = {};
    if (!participant.trim()) found.participant = minor ? 'Nom de l’enfant requis' : 'Votre nom est requis';
    if (minor && !contact.trim()) found.contact = 'Nom du parent ou tuteur requis';
    if (!EMAIL_RE.test(email.trim())) found.email = 'E-mail invalide';
    if (!consent) found.consent = 'Le consentement est obligatoire pour s’inscrire';
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    const input: RegistrationInput = {
      participant_name: participant.trim(),
      is_minor: minor,
      ...(minor && { contact_name: contact.trim() }),
      contact_email: email.trim(),
      consent: true,
      hp_extra: honeypot,
    };
    setBusy(true);
    try {
      const r = await publicApi.register(slug, input);
      onDone(r.manage_url, r.registration.participant_name);
    } catch (err) {
      if (err instanceof ApiError && err.subCode === 'activity_closed') onClosed();
      else setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} noValidate>
      <h2>Je m’inscris</h2>
      <fieldset className="choice">
        <legend className="sr-only">Qui inscrivez-vous ?</legend>
        <label className={minor ? 'on' : ''}>
          <input type="radio" name="who" data-testid="register-who-minor" checked={minor} onChange={() => setMinor(true)} />
          J’inscris mon enfant (mineur)
        </label>
        <label className={!minor ? 'on' : ''}>
          <input type="radio" name="who" data-testid="register-who-adult" checked={!minor} onChange={() => setMinor(false)} />
          Je m’inscris moi-même (majeur)
        </label>
      </fieldset>

      <label htmlFor="reg-participant">{minor ? 'Nom du participant (l’enfant) *' : 'Votre nom *'}</label>
      <input id="reg-participant" data-testid="register-participant-name" autoComplete={minor ? 'off' : 'name'} maxLength={120} value={participant} onChange={(e) => setParticipant(e.target.value)} aria-invalid={!!errors.participant} />
      {errors.participant && <p className="error">{errors.participant}</p>}

      {minor && (
        <>
          <label htmlFor="reg-contact">Votre nom (parent ou tuteur) *</label>
          <input id="reg-contact" data-testid="register-contact-name" autoComplete="name" maxLength={120} value={contact} onChange={(e) => setContact(e.target.value)} aria-invalid={!!errors.contact} />
          {errors.contact && <p className="error">{errors.contact}</p>}
        </>
      )}

      <label htmlFor="reg-email">Votre e-mail *</label>
      <input id="reg-email" type="email" data-testid="register-contact-email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!errors.email} />
      {errors.email && <p className="error">{errors.email}</p>}

      {/* Honeypot : invisible et hors navigation clavier ; un humain le laisse vide. */}
      <div className="hp" aria-hidden="true">
        {/* Nom, id et libellé neutres, sans attribut `name` : les navigateurs et gestionnaires de mots de passe remplissent
            automatiquement les champs « site web », « nom », « e-mail »…, ce qui déclencherait le honeypot et ferait
            ignorer l'inscription d'un vrai utilisateur (bug QUALIF 0.1.0.4). */}
        <label htmlFor="reg-hp">Ne pas remplir ce champ</label>
        <input
          id="reg-hp"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          data-lpignore="true"
          data-1p-ignore="true"
          data-form-type="other"
          data-testid="register-honeypot"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
        />
      </div>

      <div className="consent">
        <input id="reg-consent" type="checkbox" data-testid="register-consent" checked={consent} onChange={(e) => setConsent(e.target.checked)} aria-invalid={!!errors.consent} />
        <label htmlFor="reg-consent">
          {consentText} <Link to="/confidentialite">Politique de confidentialité</Link>
        </label>
      </div>
      {errors.consent && <p className="error">{errors.consent}</p>}

      {formError && <p className="error" role="alert" data-testid="register-error">{formError}</p>}
      <button type="submit" className="btn primary" data-testid="register-submit" disabled={busy}>Confirmer l’inscription</button>
    </form>
  );
}

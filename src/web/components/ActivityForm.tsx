import { useState, type FormEvent } from 'react';
import type { Activity, ActivityInput } from '../api/activities';
import { ApiError } from '../api/client';
import { toLocalInput } from './format';

export interface FormValues {
  title: string;
  startsAt: string;
  capacity: string;
  location: string;
  description: string;
}

export type FormErrors = Partial<Record<keyof FormValues, string>>;

/** Règles alignées sur les schémas zod du serveur (services/activities.js). */
export function validate(v: FormValues): FormErrors {
  const errors: FormErrors = {};
  const title = v.title.trim();
  if (!title) errors.title = 'Titre requis';
  else if (title.length > 120) errors.title = '120 caractères maximum';
  if (!v.startsAt || Number.isNaN(new Date(v.startsAt).getTime())) errors.startsAt = 'Date et heure requises';
  const location = v.location.trim();
  if (!location) errors.location = 'Lieu requis';
  else if (location.length > 200) errors.location = '200 caractères maximum';
  if (v.capacity.trim() !== '') {
    const n = Number(v.capacity);
    if (!Number.isInteger(n) || n <= 0) errors.capacity = 'Nombre entier supérieur à 0 (vide = illimité)';
  }
  if (v.description.trim().length > 2000) errors.description = '2000 caractères maximum';
  return errors;
}

export function toInput(v: FormValues): ActivityInput {
  return {
    title: v.title.trim(),
    description: v.description.trim() === '' ? null : v.description.trim(),
    starts_at: new Date(v.startsAt).toISOString(),
    location: v.location.trim(),
    capacity: v.capacity.trim() === '' ? null : Number(v.capacity),
  };
}

const FIELD_MAP: Record<string, keyof FormValues> = {
  title: 'title',
  starts_at: 'startsAt',
  capacity: 'capacity',
  location: 'location',
  description: 'description',
};

interface Props {
  activity?: Activity;
  submitLabel: string;
  onSubmit: (input: ActivityInput) => Promise<void>;
  onCancel: () => void;
}

export function ActivityForm({ activity, submitLabel, onSubmit, onCancel }: Props) {
  const [values, setValues] = useState<FormValues>({
    title: activity?.title ?? '',
    startsAt: activity ? toLocalInput(activity.starts_at) : '',
    capacity: activity?.capacity != null ? String(activity.capacity) : '',
    location: activity?.location ?? '',
    description: activity?.description ?? '',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (key: keyof FormValues) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [key]: e.target.value }));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const found = validate(values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    try {
      await onSubmit(toInput(values));
    } catch (err) {
      if (err instanceof ApiError) {
        const mapped: FormErrors = {};
        for (const d of err.details) {
          const key = FIELD_MAP[d.field];
          if (key) mapped[key] = d.message;
        }
        setErrors(mapped);
        setFormError(
          err.subCode === 'capacity_below_registrations'
            ? 'Le nombre de places est inférieur au nombre d’inscrits.'
            : Object.keys(mapped).length > 0
              ? null
              : err.message,
        );
      } else {
        setFormError('Erreur inattendue.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} noValidate>
      <label htmlFor="af-title">Titre *</label>
      <input id="af-title" data-testid="activity-form-title" value={values.title} onChange={set('title')} aria-invalid={!!errors.title} />
      {errors.title && <p className="error">{errors.title}</p>}

      <div className="grid2">
        <div>
          <label htmlFor="af-starts">Date et heure *</label>
          <input
            id="af-starts"
            type="datetime-local"
            data-testid="activity-form-starts-at"
            value={values.startsAt}
            onChange={set('startsAt')}
            aria-invalid={!!errors.startsAt}
          />
          {errors.startsAt && <p className="error">{errors.startsAt}</p>}
        </div>
        <div>
          <label htmlFor="af-capacity">Places (vide = illimité)</label>
          <input
            id="af-capacity"
            type="number"
            min={1}
            data-testid="activity-form-capacity"
            value={values.capacity}
            onChange={set('capacity')}
            aria-invalid={!!errors.capacity}
          />
          {errors.capacity && <p className="error">{errors.capacity}</p>}
        </div>
      </div>

      <label htmlFor="af-location">Lieu *</label>
      <input id="af-location" data-testid="activity-form-location" value={values.location} onChange={set('location')} aria-invalid={!!errors.location} />
      {errors.location && <p className="error">{errors.location}</p>}

      <label htmlFor="af-description">Description</label>
      <textarea id="af-description" rows={3} data-testid="activity-form-description" value={values.description} onChange={set('description')} />
      {errors.description && <p className="error">{errors.description}</p>}

      {formError && <p className="error" role="alert">{formError}</p>}
      <div className="row" style={{ marginTop: 14 }}>
        <button type="submit" className="btn primary" data-testid="activity-form-submit" disabled={busy}>
          {submitLabel}
        </button>
        <button type="button" className="btn" onClick={onCancel}>Annuler</button>
      </div>
    </form>
  );
}

import { ZodError } from 'zod';

/** Erreur HTTP au format du contrat : `{ error, message, details? }`. */
export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const notFound = (what = 'Ressource') => new HttpError(404, 'not_found', `${what} introuvable`);
/** 409 : `error = conflict`, sous-code en tête du message (contrat : « sous-code dans message »). */
export const conflict = (subcode, text) => new HttpError(409, 'conflict', `${subcode} : ${text}`);

/** Valide `data` avec un schéma zod ; lève 400 validation_error avec `details`. */
export function parse(schema, data) {
  const r = schema.safeParse(data);
  if (r.success) return r.data;
  throw zodToHttp(r.error);
}

export function zodToHttp(error) {
  const details = error.issues.map((i) => ({ field: i.path.join('.') || '(body)', message: i.message }));
  return new HttpError(400, 'validation_error', 'Données invalides', details);
}

export { ZodError };

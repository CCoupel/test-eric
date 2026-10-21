export interface FieldError {
  field: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details: FieldError[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Sous-code d'un 409 : `invalid_transition : …` → `invalid_transition`. */
  get subCode(): string {
    if (this.code !== 'conflict') return this.code;
    return /^([a-z_]+)/.exec(this.message)?.[1] ?? this.code;
  }
}

let unauthorizedHandler: (() => void) | null = null;

/** Appelé sur tout 401 (hors tentative de connexion) : la session est perdue. */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

export async function api<T = void>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: 'include',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'network_error', 'Serveur injoignable. Réessayez dans un instant.');
  }
  if (res.status === 204) return undefined as T;
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* corps vide ou non JSON */
  }
  if (!res.ok) {
    const e = (data ?? {}) as { error?: string; message?: string; details?: FieldError[] };
    if (res.status === 401 && path !== '/api/auth/login') unauthorizedHandler?.();
    throw new ApiError(res.status, e.error ?? 'internal_error', e.message ?? `Erreur ${res.status}`, e.details);
  }
  return data as T;
}

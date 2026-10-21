import { vi } from 'vitest';

export interface MockRoute {
  method?: string;
  path: string | RegExp;
  status?: number;
  body?: unknown;
}

/** Stub de fetch : première route correspondante ; 404 sinon. Renvoie le mock pour inspecter les appels. */
export function mockFetch(routes: MockRoute[]) {
  const fn = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    const method = init?.method ?? 'GET';
    const r = routes.find((x) => (x.method ?? 'GET') === method && (typeof x.path === 'string' ? x.path === path : x.path.test(path)));
    const status = r ? (r.status ?? 200) : 404;
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => (r?.body === undefined ? Promise.reject(new Error('no body')) : Promise.resolve(r.body)),
    } as Response);
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

export const ACTIVITY = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Stage judo',
  description: 'Apporter kimono',
  starts_at: '2026-12-28T13:00:00.000Z',
  location: 'Dojo municipal',
  capacity: 20,
  status: 'draft' as const,
  public_slug: 'abcDEF123456',
  public_url: 'http://localhost:3000/a/abcDEF123456',
  owner: { id: 'u1', name: 'Marie Dupont' },
  registrations_count: 0,
  remaining_places: 20,
  created_at: '2026-10-01T10:00:00.000Z',
  updated_at: '2026-10-01T10:00:00.000Z',
};

export const USER = { id: 'u1', email: 'marie@club.fr', name: 'Marie Dupont', role: 'admin' };

import { api } from './client';

export type ActivityStatus = 'draft' | 'open' | 'closed';

export interface Activity {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  location: string;
  capacity: number | null;
  status: ActivityStatus;
  public_slug: string;
  public_url: string;
  owner: { id: string; name: string };
  registrations_count: number;
  remaining_places: number | null;
  created_at: string;
  updated_at: string;
}

export interface Registration {
  id: string;
  participant_name: string;
  is_minor: boolean;
  contact_name: string;
  contact_email: string;
  created_at: string;
}

export interface ActivityInput {
  title: string;
  description: string | null;
  starts_at: string;
  location: string;
  capacity: number | null;
}

export const activitiesApi = {
  list: (status?: ActivityStatus) =>
    api<{ activities: Activity[] }>('GET', `/api/activities${status ? `?status=${status}` : ''}`).then((r) => r.activities),
  get: (id: string) => api<{ activity: Activity }>('GET', `/api/activities/${id}`).then((r) => r.activity),
  create: (input: ActivityInput) => api<{ activity: Activity }>('POST', '/api/activities', input).then((r) => r.activity),
  update: (id: string, input: Partial<ActivityInput>) =>
    api<{ activity: Activity }>('PATCH', `/api/activities/${id}`, input).then((r) => r.activity),
  open: (id: string) => api<{ activity: Activity }>('POST', `/api/activities/${id}/open`).then((r) => r.activity),
  close: (id: string) => api<{ activity: Activity }>('POST', `/api/activities/${id}/close`).then((r) => r.activity),
  remove: (id: string) => api('DELETE', `/api/activities/${id}`),
  registrations: (id: string) =>
    api<{ registrations: Registration[]; count: number; capacity: number | null; remaining_places: number | null }>(
      'GET',
      `/api/activities/${id}/registrations`,
    ),
};

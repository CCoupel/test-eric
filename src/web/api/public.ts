import { api } from './client';

export interface PublicActivity {
  title: string;
  description: string | null;
  starts_at: string;
  location: string;
  status: 'open' | 'closed' | 'draft';
  capacity: number | null;
  remaining_places: number | null;
  is_full: boolean;
}

export interface PublicRegistration {
  id: string;
  participant_name: string;
  is_minor: boolean;
  contact_name: string;
  contact_email: string;
  created_at: string;
}

export interface RegistrationInput {
  participant_name: string;
  is_minor: boolean;
  contact_name?: string;
  contact_email: string;
  consent: true;
  website: string;
}

export interface PublicInfo {
  contact_email: string | null;
}

export const publicApi = {
  info: () => api<PublicInfo>('GET', '/api/public/info'),
  activity: (slug: string) =>
    api<{ activity: PublicActivity; consent_text: string; consent_version: string }>(
      'GET',
      `/api/public/activities/${encodeURIComponent(slug)}`,
    ),
  register: (slug: string, input: RegistrationInput) =>
    api<{ registration: PublicRegistration; manage_url: string }>(
      'POST',
      `/api/public/activities/${encodeURIComponent(slug)}/registrations`,
      input,
    ),
  registration: (token: string) =>
    api<{
      registration: PublicRegistration;
      activity: { title: string; starts_at: string; location: string; status: string; public_url: string };
    }>('GET', `/api/public/registrations/${encodeURIComponent(token)}`),
  unregister: (token: string) => api('DELETE', `/api/public/registrations/${encodeURIComponent(token)}`),
};

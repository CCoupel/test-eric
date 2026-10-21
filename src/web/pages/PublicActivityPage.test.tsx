import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { mockFetch } from '../test-utils';

const PUBLIC = {
  activity: {
    title: 'Stage judo',
    description: 'Apporter kimono',
    starts_at: '2026-12-28T13:00:00.000Z',
    location: 'Dojo municipal',
    status: 'open',
    capacity: 20,
    remaining_places: 8,
    is_full: false,
  },
  consent_text: 'J’accepte que le club conserve ces informations.',
  consent_version: '2026-10',
};
const REG = {
  registration: { id: 'r1', participant_name: 'Léo Martin', is_minor: true, contact_name: 'Sophie Martin', contact_email: 'sophie@mail.fr', created_at: '2026-10-01T10:00:00.000Z' },
  manage_url: 'http://localhost:3000/r/' + 'A'.repeat(43),
};

function renderPublic() {
  render(
    <MemoryRouter initialEntries={['/a/abc']}>
      <App />
    </MemoryRouter>,
  );
}

async function fill(minor: boolean) {
  if (!minor) await userEvent.click(await screen.findByTestId('register-who-adult'));
  await userEvent.type(await screen.findByTestId('register-participant-name'), 'Léo Martin');
  if (minor) await userEvent.type(screen.getByTestId('register-contact-name'), 'Sophie Martin');
  await userEvent.type(screen.getByTestId('register-contact-email'), 'sophie@mail.fr');
}

afterEach(() => vi.unstubAllGlobals());

describe('PublicActivityPage', () => {
  it('affiche la fiche, les places restantes et le formulaire', async () => {
    mockFetch([{ path: '/api/public/activities/abc', body: PUBLIC }]);
    renderPublic();
    expect(await screen.findByTestId('public-activity-title')).toHaveTextContent('Stage judo');
    expect(screen.getByTestId('public-places')).toHaveTextContent('8 places restantes');
    expect(screen.getByTestId('register-submit')).toBeInTheDocument();
  });

  it('la bascule adulte masque le nom du parent', async () => {
    mockFetch([{ path: '/api/public/activities/abc', body: PUBLIC }]);
    renderPublic();
    expect(await screen.findByTestId('register-contact-name')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('register-who-adult'));
    expect(screen.queryByTestId('register-contact-name')).toBeNull();
  });

  it('refuse sans consentement et n’appelle pas l’API', async () => {
    const f = mockFetch([{ path: '/api/public/activities/abc', body: PUBLIC }]);
    renderPublic();
    await fill(true);
    await userEvent.click(screen.getByTestId('register-submit'));
    expect(screen.getByText(/consentement est obligatoire/)).toBeInTheDocument();
    expect(f.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
  });

  it('inscrit un mineur et affiche le lien de gestion', async () => {
    const f = mockFetch([
      { path: '/api/public/activities/abc', body: PUBLIC },
      { method: 'POST', path: '/api/public/activities/abc/registrations', status: 201, body: REG },
    ]);
    renderPublic();
    await fill(true);
    await userEvent.click(screen.getByTestId('register-consent'));
    await userEvent.click(screen.getByTestId('register-submit'));
    expect(await screen.findByTestId('register-confirmation')).toBeInTheDocument();
    expect(screen.getByTestId('register-manage-url')).toHaveTextContent(/\/r\/A{43}/);
    const post = f.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({
      participant_name: 'Léo Martin', is_minor: true, contact_name: 'Sophie Martin', contact_email: 'sophie@mail.fr', consent: true,
    });
  });

  it('adulte : pas de contact_name dans la requête', async () => {
    const f = mockFetch([
      { path: '/api/public/activities/abc', body: PUBLIC },
      { method: 'POST', path: '/api/public/activities/abc/registrations', status: 201, body: REG },
    ]);
    renderPublic();
    await fill(false);
    await userEvent.click(screen.getByTestId('register-consent'));
    await userEvent.click(screen.getByTestId('register-submit'));
    await screen.findByTestId('register-confirmation');
    const post = f.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(String(post?.[1]?.body))).not.toHaveProperty('contact_name');
  });

  it('affiche le doublon (409 already_registered)', async () => {
    mockFetch([
      { path: '/api/public/activities/abc', body: PUBLIC },
      { method: 'POST', path: '/api/public/activities/abc/registrations', status: 409, body: { error: 'already_registered', message: 'x' } },
    ]);
    renderPublic();
    await fill(true);
    await userEvent.click(screen.getByTestId('register-consent'));
    await userEvent.click(screen.getByTestId('register-submit'));
    expect(await screen.findByTestId('register-error')).toHaveTextContent('déjà inscrit');
  });

  it('activité complète : message, pas de formulaire', async () => {
    mockFetch([{ path: '/api/public/activities/abc', body: { ...PUBLIC, activity: { ...PUBLIC.activity, remaining_places: 0, is_full: true } } }]);
    renderPublic();
    expect(await screen.findByTestId('public-activity-full')).toBeInTheDocument();
    expect(screen.queryByTestId('register-submit')).toBeNull();
  });

  it('activité fermée : message, pas de formulaire', async () => {
    mockFetch([{ path: '/api/public/activities/abc', body: { ...PUBLIC, activity: { ...PUBLIC.activity, status: 'closed' } } }]);
    renderPublic();
    expect(await screen.findByTestId('public-activity-closed')).toBeInTheDocument();
    expect(screen.queryByTestId('register-submit')).toBeNull();
  });

  it('slug inconnu : activité introuvable', async () => {
    mockFetch([{ path: '/api/public/activities/abc', status: 404, body: { error: 'not_found', message: 'x' } }]);
    renderPublic();
    expect(await screen.findByTestId('public-not-found')).toBeInTheDocument();
  });
});

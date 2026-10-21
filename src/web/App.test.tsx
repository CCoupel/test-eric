import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { ACTIVITY, USER, mockFetch } from './test-utils';

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('App — session', () => {
  it('redirige vers /login sans session', async () => {
    mockFetch([{ path: '/api/auth/me', status: 401, body: { error: 'unauthenticated', message: 'x' } }]);
    renderAt('/activities');
    expect(await screen.findByRole('heading', { name: 'Connexion responsable' })).toBeInTheDocument();
  });

  it('affiche la liste après connexion', async () => {
    const fetchMock = mockFetch([
      { path: '/api/auth/me', status: 401, body: { error: 'unauthenticated', message: 'x' } },
      { method: 'POST', path: '/api/auth/login', body: { user: USER } },
      { path: '/api/activities', body: { activities: [ACTIVITY] } },
    ]);
    renderAt('/login');
    await userEvent.type(await screen.findByTestId('login-email'), 'marie@club.fr');
    await userEvent.type(screen.getByTestId('login-password'), 'secret-secret');
    await userEvent.click(screen.getByTestId('login-submit'));
    expect(await screen.findByTestId('activity-row')).toHaveTextContent('Stage judo');
    expect(screen.getByTestId('activity-status-badge')).toHaveTextContent('Brouillon');
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({ method: 'POST', credentials: 'include' }));
  });

  it('affiche une erreur sur identifiants faux', async () => {
    mockFetch([
      { path: '/api/auth/me', status: 401, body: { error: 'unauthenticated', message: 'x' } },
      { method: 'POST', path: '/api/auth/login', status: 401, body: { error: 'invalid_credentials', message: 'x' } },
    ]);
    renderAt('/login');
    await userEvent.type(await screen.findByTestId('login-email'), 'a@b.fr');
    await userEvent.type(screen.getByTestId('login-password'), 'mauvais');
    await userEvent.click(screen.getByTestId('login-submit'));
    expect(await screen.findByTestId('login-error')).toHaveTextContent('incorrect');
  });

  it('liste vide : message dédié', async () => {
    mockFetch([
      { path: '/api/auth/me', body: { user: USER } },
      { path: '/api/activities', body: { activities: [] } },
    ]);
    renderAt('/activities');
    expect(await screen.findByText(/Aucune activité pour l’instant/)).toBeInTheDocument();
  });
});

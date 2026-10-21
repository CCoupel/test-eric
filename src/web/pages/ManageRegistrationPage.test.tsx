import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { mockFetch } from '../test-utils';

const TOKEN = 'T'.repeat(43);
const DATA = {
  registration: { id: 'r1', participant_name: 'Léo Martin', is_minor: true, contact_name: 'Sophie Martin', contact_email: 'sophie@mail.fr', created_at: '2026-10-01T10:00:00.000Z' },
  activity: { title: 'Stage judo', starts_at: '2026-12-28T13:00:00.000Z', location: 'Dojo', status: 'open', public_url: 'http://x/a/abc' },
};

function renderManage() {
  render(
    <MemoryRouter initialEntries={[`/r/${TOKEN}`]}>
      <App />
    </MemoryRouter>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('ManageRegistrationPage', () => {
  it('affiche l’inscription puis désinscrit après confirmation', async () => {
    const f = mockFetch([
      { path: `/api/public/registrations/${TOKEN}`, body: DATA },
      { method: 'DELETE', path: `/api/public/registrations/${TOKEN}`, status: 204 },
    ]);
    renderManage();
    expect(await screen.findByTestId('manage-participant-name')).toHaveTextContent('Léo Martin');
    await userEvent.click(screen.getByTestId('manage-unregister'));
    expect(f.mock.calls.some(([, i]) => i?.method === 'DELETE')).toBe(false);
    await userEvent.click(screen.getByTestId('manage-unregister-confirm'));
    expect(await screen.findByTestId('manage-unregistered')).toBeInTheDocument();
  });

  it('token inconnu : message neutre', async () => {
    mockFetch([{ path: `/api/public/registrations/${TOKEN}`, status: 404, body: { error: 'not_found', message: 'x' } }]);
    renderManage();
    expect(await screen.findByTestId('manage-not-found')).toBeInTheDocument();
  });

  it('ne déclenche aucun appel mutant au chargement', async () => {
    const f = mockFetch([{ path: `/api/public/registrations/${TOKEN}`, body: DATA }]);
    renderManage();
    await screen.findByTestId('manage-unregister');
    expect(f.mock.calls.every(([, i]) => (i?.method ?? 'GET') === 'GET')).toBe(true);
  });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { mockFetch } from '../test-utils';

const TOKEN = 'U'.repeat(43);

function renderU() {
  render(
    <MemoryRouter initialEntries={[`/u/${TOKEN}`]}>
      <App />
    </MemoryRouter>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('UnsubscribePage', () => {
  it('le chargement ne désinscrit pas ; la confirmation envoie le POST', async () => {
    const f = mockFetch([
      { path: `/api/public/unsubscribe/${TOKEN}`, body: { activities: [{ title: 'Stage judo', starts_at: '2026-12-28T13:00:00.000Z' }] } },
      { method: 'POST', path: `/api/public/unsubscribe/${TOKEN}`, status: 204 },
    ]);
    renderU();
    expect(await screen.findByText(/Stage judo/)).toBeInTheDocument();
    expect(f.mock.calls.every(([, i]) => (i?.method ?? 'GET') === 'GET')).toBe(true);
    await userEvent.click(screen.getByTestId('unsubscribe-confirm'));
    expect(await screen.findByTestId('unsubscribe-done')).toBeInTheDocument();
  });

  it('jeton inconnu : message neutre', async () => {
    mockFetch([{ path: `/api/public/unsubscribe/${TOKEN}`, status: 404, body: { error: 'not_found', message: 'x' } }]);
    renderU();
    expect(await screen.findByTestId('unsubscribe-not-found')).toBeInTheDocument();
  });

  it('POST en 404 (déjà utilisé) : message neutre', async () => {
    mockFetch([
      { path: `/api/public/unsubscribe/${TOKEN}`, body: { activities: [{ title: 'Stage', starts_at: '2026-12-28T13:00:00.000Z' }] } },
      { method: 'POST', path: `/api/public/unsubscribe/${TOKEN}`, status: 404, body: { error: 'not_found', message: 'x' } },
    ]);
    renderU();
    await userEvent.click(await screen.findByTestId('unsubscribe-confirm'));
    expect(await screen.findByTestId('unsubscribe-not-found')).toBeInTheDocument();
  });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ACTIVITY, mockFetch } from '../test-utils';
import { ActivityDetailPage } from './ActivityDetailPage';

const REGS = { registrations: [], count: 0, capacity: 20, remaining_places: 20 };

function renderDetail() {
  render(
    <MemoryRouter initialEntries={[`/activities/${ACTIVITY.id}`]}>
      <Routes>
        <Route path="/activities/:id" element={<ActivityDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('ActivityDetailPage — machine d’états', () => {
  it('brouillon : ouvrir, supprimer, pas de lien public', async () => {
    mockFetch([
      { path: `/api/activities/${ACTIVITY.id}`, body: { activity: ACTIVITY } },
      { path: `/api/activities/${ACTIVITY.id}/registrations`, body: REGS },
    ]);
    renderDetail();
    expect(await screen.findByRole('heading', { name: /Stage judo/ })).toBeInTheDocument();
    expect(screen.getByTestId('activity-open-button')).toHaveTextContent('Ouvrir aux inscriptions');
    expect(screen.getByTestId('activity-delete-button')).toBeInTheDocument();
    expect(screen.queryByTestId('activity-close-button')).toBeNull();
    expect(screen.queryByTestId('activity-public-link')).toBeNull();
    expect(screen.getByTestId('registrations-empty')).toBeInTheDocument();
  });

  it('ouvrir affiche le lien public et le bouton fermer', async () => {
    mockFetch([
      { path: `/api/activities/${ACTIVITY.id}`, body: { activity: ACTIVITY } },
      { path: `/api/activities/${ACTIVITY.id}/registrations`, body: REGS },
      { method: 'POST', path: `/api/activities/${ACTIVITY.id}/open`, body: { activity: { ...ACTIVITY, status: 'open' } } },
    ]);
    renderDetail();
    await userEvent.click(await screen.findByTestId('activity-open-button'));
    expect(await screen.findByTestId('activity-public-link')).toHaveTextContent('/a/abcDEF123456');
    expect(screen.getByTestId('activity-status-badge')).toHaveTextContent('Ouverte');
    expect(screen.getByTestId('activity-close-button')).toBeInTheDocument();
  });

  it('fermée avec inscrits : rouvrir mais pas supprimer', async () => {
    mockFetch([
      { path: `/api/activities/${ACTIVITY.id}`, body: { activity: { ...ACTIVITY, status: 'closed', registrations_count: 3 } } },
      { path: `/api/activities/${ACTIVITY.id}/registrations`, body: REGS },
    ]);
    renderDetail();
    expect(await screen.findByTestId('activity-open-button')).toHaveTextContent('Rouvrir');
    expect(screen.queryByTestId('activity-delete-button')).toBeNull();
  });

  it('404 : activité introuvable', async () => {
    mockFetch([
      { path: `/api/activities/${ACTIVITY.id}`, status: 404, body: { error: 'not_found', message: 'x' } },
      { path: `/api/activities/${ACTIVITY.id}/registrations`, status: 404, body: { error: 'not_found', message: 'x' } },
    ]);
    renderDetail();
    expect(await screen.findByText('Activité introuvable.')).toBeInTheDocument();
  });
});

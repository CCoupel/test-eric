import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { mockFetch } from '../test-utils';

function renderPrivacy() {
  render(
    <MemoryRouter initialEntries={['/confidentialite']}>
      <App />
    </MemoryRouter>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('PrivacyPage', () => {
  it('affiche l’adresse de contact fournie par /api/public/info', async () => {
    mockFetch([{ path: '/api/public/info', body: { contact_email: 'bureau@club.fr', retention_months: 6 } }]);
    renderPrivacy();
    expect(await screen.findByTestId('privacy-contact')).toHaveAttribute('href', 'mailto:bureau@club.fr');
    expect(screen.getByTestId('privacy-retention')).toHaveTextContent('6 mois');
  });

  it('repli sans adresse (null ou erreur)', async () => {
    mockFetch([{ path: '/api/public/info', status: 500, body: { error: 'internal_error', message: 'x' } }]);
    renderPrivacy();
    expect(await screen.findByRole('heading', { name: 'Politique de confidentialité' })).toBeInTheDocument();
    expect(screen.queryByTestId('privacy-contact')).toBeNull();
    expect(screen.getByText(/via votre responsable d’activité/)).toBeInTheDocument();
    expect(screen.getByTestId('privacy-retention')).toHaveTextContent('12 mois');
  });
});

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

describe('App', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ status: 'ok', version: '0.1.0.0', db: 'ok' }),
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it('affiche le titre et le résultat de /health', async () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Inscriptions-club' })).toBeInTheDocument();
    expect(await screen.findByText(/Serveur : ok — base : ok/)).toBeInTheDocument();
  });
});

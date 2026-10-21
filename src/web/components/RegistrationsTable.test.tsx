import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Registration } from '../api/activities';
import { RegistrationsTable } from './RegistrationsTable';

const REGS: Registration[] = [
  { id: 'r1', participant_name: 'Léo Martin', is_minor: true, contact_name: 'Sophie Martin', contact_email: 's@mail.fr', created_at: '2026-10-12T10:00:00.000Z' },
  { id: 'r2', participant_name: 'Karim Benali', is_minor: false, contact_name: 'Karim Benali', contact_email: 'k@mail.fr', created_at: '2026-10-13T10:00:00.000Z' },
];

describe('RegistrationsTable', () => {
  it('liste vide : message dédié', () => {
    render(<RegistrationsTable registrations={[]} onRemove={vi.fn()} />);
    expect(screen.getByTestId('registrations-empty')).toBeInTheDocument();
  });

  it('affiche badge mineur et contact parent', () => {
    render(<RegistrationsTable registrations={REGS} onRemove={vi.fn()} />);
    expect(screen.getAllByTestId('registration-row')).toHaveLength(2);
    expect(screen.getByText('mineur')).toBeInTheDocument();
    expect(screen.getByText('Sophie Martin (parent)')).toBeInTheDocument();
  });

  it('retirer demande une confirmation explicite avant d’appeler l’API', async () => {
    const onRemove = vi.fn().mockResolvedValue(undefined);
    render(<RegistrationsTable registrations={REGS} onRemove={onRemove} />);
    await userEvent.click(screen.getAllByTestId('registration-remove')[0]);
    expect(onRemove).not.toHaveBeenCalled();
    expect(screen.getByText(/supprime définitivement ses données personnelles/)).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('registration-remove-confirm'));
    expect(onRemove).toHaveBeenCalledWith('r1');
  });

  it('annuler ne supprime rien', async () => {
    const onRemove = vi.fn();
    render(<RegistrationsTable registrations={REGS} onRemove={onRemove} />);
    await userEvent.click(screen.getAllByTestId('registration-remove')[1]);
    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(onRemove).not.toHaveBeenCalled();
    expect(screen.getAllByTestId('registration-remove')).toHaveLength(2);
  });

  it('affiche l’erreur si la suppression échoue', async () => {
    render(<RegistrationsTable registrations={REGS} onRemove={vi.fn().mockRejectedValue(new Error('Inscription introuvable'))} />);
    await userEvent.click(screen.getAllByTestId('registration-remove')[0]);
    await userEvent.click(screen.getByTestId('registration-remove-confirm'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Inscription introuvable');
  });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ActivityForm, toInput, validate } from './ActivityForm';

const valid = { title: 'Stage', startsAt: '2026-12-28T14:00', capacity: '20', location: 'Dojo', description: '' };

describe('validate', () => {
  it('accepte un formulaire valide', () => expect(validate(valid)).toEqual({}));
  it('refuse titre/lieu vides, date manquante, places invalides', () => {
    const e = validate({ ...valid, title: ' ', location: '', startsAt: '', capacity: '0' });
    expect(Object.keys(e).sort()).toEqual(['capacity', 'location', 'startsAt', 'title']);
  });
  it('places vides = illimité', () => expect(validate({ ...valid, capacity: '' })).toEqual({}));
  it('refuse un nombre décimal', () => expect(validate({ ...valid, capacity: '2.5' }).capacity).toBeDefined());
});

describe('toInput', () => {
  it('convertit en payload API', () => {
    const i = toInput({ ...valid, capacity: '', description: '  ' });
    expect(i).toMatchObject({ title: 'Stage', location: 'Dojo', capacity: null, description: null });
    expect(i.starts_at).toMatch(/^\d{4}-\d\d-\d\dT.*Z$/);
  });
});

describe('ActivityForm', () => {
  it('ne soumet pas un titre vide', async () => {
    const onSubmit = vi.fn();
    render(<ActivityForm submitLabel="Enregistrer" onSubmit={onSubmit} onCancel={() => undefined} />);
    await userEvent.type(screen.getByTestId('activity-form-location'), 'Gymnase');
    await userEvent.click(screen.getByTestId('activity-form-submit'));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Titre requis')).toBeInTheDocument();
  });

  it('soumet les valeurs valides', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ActivityForm submitLabel="Enregistrer" onSubmit={onSubmit} onCancel={() => undefined} />);
    await userEvent.type(screen.getByTestId('activity-form-title'), 'Stage');
    await userEvent.type(screen.getByTestId('activity-form-starts-at'), '2026-12-28T14:00');
    await userEvent.type(screen.getByTestId('activity-form-location'), 'Dojo');
    await userEvent.click(screen.getByTestId('activity-form-submit'));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ title: 'Stage', location: 'Dojo', capacity: null }));
  });
});

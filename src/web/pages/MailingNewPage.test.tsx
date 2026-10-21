import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { ACTIVITY, USER, mockFetch, type MockRoute } from '../test-utils';

const ACT = { ...ACTIVITY, status: 'open' as const, registrations_count: 3 };
const MAILING = {
  id: '22222222-2222-4222-8222-222222222222', subject: 'Rappel', status: 'sent', transport: 'stub', sender: { id: 'u1', name: 'Marie Dupont' },
  activities: [{ id: ACT.id, title: ACT.title }], recipients_count: 3, sent_count: 3, failed_count: 0, created_at: '2026-10-01T10:00:00.000Z', completed_at: null,
};

function base(extra: MockRoute[] = [], stub = true): MockRoute[] {
  return [
    { path: '/api/auth/me', body: { user: USER } },
    { path: '/api/activities', body: { activities: [ACT] } },
    { path: '/api/mail/status', body: { transport: stub ? 'stub' : 'smtp', from: null } },
    { path: /recipients-preview/, body: { recipients_count: 3, by_activity: [{ id: ACT.id, title: ACT.title, count: 3 }] } },
    ...extra,
  ];
}

function renderNew() {
  render(
    <MemoryRouter initialEntries={['/mailings/new']}>
      <App />
    </MemoryRouter>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('MailingNewPage', () => {
  it('bandeau stub, aperçu des destinataires et bouton désactivé tant que rien n’est coché', async () => {
    mockFetch(base());
    renderNew();
    expect(await screen.findByTestId('mailing-stub-banner')).toBeInTheDocument();
    expect(await screen.findByTestId('mailing-activity')).toHaveTextContent('3 inscrits');
    expect(screen.getByTestId('mailing-submit')).toBeDisabled();
    await userEvent.click(screen.getByRole('checkbox'));
    expect(await screen.findByText(/3 destinataires uniques/)).toBeInTheDocument();
    expect(screen.getByTestId('mailing-submit')).toHaveTextContent('Envoyer à 3 destinataires');
    expect(screen.getByTestId('mailing-submit')).toBeEnabled();
  });

  it('pas de bandeau en SMTP', async () => {
    mockFetch(base([], false));
    renderNew();
    await screen.findByTestId('mailing-activity');
    expect(screen.queryByTestId('mailing-stub-banner')).toBeNull();
  });

  it('0 destinataire : envoi impossible', async () => {
    mockFetch([{ path: /recipients-preview/, body: { recipients_count: 0, by_activity: [] } }, ...base()]);
    renderNew();
    await userEvent.click(await screen.findByRole('checkbox'));
    expect(await screen.findByText(/0 destinataire unique/)).toBeInTheDocument();
    expect(screen.getByTestId('mailing-submit')).toBeDisabled();
  });

  it('refuse un objet ou un message vide sans appeler l’API', async () => {
    const f = mockFetch(base());
    renderNew();
    await userEvent.click(await screen.findByRole('checkbox'));
    await screen.findByText(/3 destinataires uniques/);
    await userEvent.click(screen.getByTestId('mailing-submit'));
    expect(screen.getByText('Objet requis')).toBeInTheDocument();
    expect(screen.getByText('Message requis')).toBeInTheDocument();
    expect(f.mock.calls.some(([, i]) => i?.method === 'POST')).toBe(false);
  });

  it('envoie puis affiche le détail ; payload strict', async () => {
    const f = mockFetch(
      base([
        { method: 'POST', path: '/api/mailings', status: 201, body: { mailing: MAILING } },
        { path: `/api/mailings/${MAILING.id}`, body: { mailing: { ...MAILING, body: 'Bonjour <b>x</b>' }, recipients: [{ email: 'a@b.fr', status: 'stubbed', error: null, sent_at: null }, { email: null, status: 'sent', error: null, sent_at: null }] } },
      ]),
    );
    renderNew();
    await userEvent.click(await screen.findByRole('checkbox'));
    await screen.findByText(/3 destinataires uniques/);
    await userEvent.type(screen.getByTestId('mailing-subject'), 'Rappel');
    await userEvent.type(screen.getByTestId('mailing-body'), 'Bonjour');
    await userEvent.click(screen.getByTestId('mailing-submit'));
    expect(await screen.findAllByTestId('mailing-detail-recipient')).toHaveLength(2);
    expect(screen.getByTestId('mailing-status-badge')).toHaveTextContent('Simulé');
    expect(screen.getByText('désinscrit depuis')).toBeInTheDocument();
    // texte brut : aucun rendu HTML du corps
    expect(screen.getByTestId('mailing-body-text').textContent).toBe('Bonjour <b>x</b>');
    expect(screen.getByTestId('mailing-body-text').querySelector('b')).toBeNull();
    const post = f.mock.calls.find(([, i]) => i?.method === 'POST');
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ activity_ids: [ACT.id], subject: 'Rappel', body: 'Bonjour' });
  });

  it.each([
    ['duplicate_mailing', 'identique'],
    ['mailing_in_progress', 'déjà en cours'],
    ['too_many_recipients', 'Trop de destinataires'],
  ])('affiche l’erreur 409 %s', async (sub, text) => {
    mockFetch(base([{ method: 'POST', path: '/api/mailings', status: 409, body: { error: 'conflict', message: `${sub} : x` } }]));
    renderNew();
    await userEvent.click(await screen.findByRole('checkbox'));
    await screen.findByText(/3 destinataires uniques/);
    await userEvent.type(screen.getByTestId('mailing-subject'), 'S');
    await userEvent.type(screen.getByTestId('mailing-body'), 'B');
    await userEvent.click(screen.getByTestId('mailing-submit'));
    expect(await screen.findByRole('alert')).toHaveTextContent(text);
    expect(screen.getByTestId('mailing-submit')).toBeEnabled();
  });
});

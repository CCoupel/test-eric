import { test, expect, type APIRequestContext } from '@playwright/test';

// Parcours : le responsable compose un e-mail groupe -> apercu des destinataires -> envoi (transport stub) -> historique.
// Maquette : docs/mockup/v0.1.0/ui/espace_responsable__emails.html. Selecteurs data-testid : handoff test-writer LOT-4.
// Les donnees (activite ouverte + inscrits) sont preparees par l'API ; E2E_BASE_URL absent => serveur local en mode stub.

const email = process.env.E2E_ADMIN_EMAIL ?? process.env.ADMIN_EMAIL ?? '';
const password = process.env.E2E_ADMIN_PASSWORD ?? process.env.ADMIN_PASSWORD ?? '';

async function preparer(request: APIRequestContext, baseURL: string, titre: string, inscrits: number) {
  const origin = new URL(baseURL).origin;
  const h = { Origin: origin };
  const login = await request.post('/api/auth/login', { data: { email, password }, headers: h });
  expect(login.status()).toBe(200);
  const { activity } = await (await request.post('/api/activities', {
    data: { title: titre, starts_at: '2026-12-28T14:00:00.000Z', location: 'Dojo municipal', capacity: null }, headers: h })).json();
  await request.post(`/api/activities/${activity.id}/open`, { headers: h });
  for (let i = 1; i <= inscrits; i++) {
    const r = await request.post(`/api/public/activities/${activity.public_slug}/registrations`, {
      headers: h,
      data: { participant_name: `Enfant ${i}`, is_minor: true, contact_name: `Parent ${i}`, contact_email: `parent${i}.${Date.now()}@example.org`, consent: true },
    });
    expect(r.status()).toBe(201);
  }
  return activity as { id: string; title: string };
}

test.describe('Mailing - composer', () => {
  test.skip(!email || !password, 'E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD (ou ADMIN_*) requis');

  test('@critical apercu des destinataires, envoi en mode stub, historique', async ({ page, baseURL }) => {
    const titre = `Mailing E2E ${Date.now()}`;
    const sujet = `Rappel E2E ${Date.now()}`;
    await preparer(page.request, baseURL!, titre, 3);

    await page.goto('/mailings');
    await expect(page).toHaveURL(/\/mailings$/);
    await page.getByTestId('mailing-new-button').click();
    await expect(page).toHaveURL(/\/mailings\/new$/);

    // Bandeau d'avertissement : SMTP non configure (GET /api/mail/status = stub)
    await expect(page.getByTestId('mailing-stub-banner')).toBeVisible();

    // Selection de l'activite -> apercu : 3 destinataires
    await page.getByTestId('mailing-activity').filter({ hasText: titre }).getByRole('checkbox').check();
    await expect(page.getByTestId('mailing-recipients-preview')).toContainText('3');
    await expect(page.getByTestId('mailing-submit')).toContainText('3');

    await page.getByTestId('mailing-subject').fill(sujet);
    await page.getByTestId('mailing-body').fill('Bonjour,\n\nPensez au kimono et a la gourde.');
    await page.getByTestId('mailing-submit').click();

    // Resultat : detail de l'envoi, badge "Simule", 3 destinataires
    await expect(page).toHaveURL(/\/mailings\/[0-9a-f-]{36}$/);
    await expect(page.getByTestId('mailing-status-badge')).toContainText(/Simul/i);
    await expect(page.getByTestId('mailing-detail-recipient')).toHaveCount(3);

    // Historique
    await page.goto('/mailings');
    const ligne = page.getByTestId('mailing-row').filter({ hasText: sujet });
    await expect(ligne).toBeVisible();
    await expect(ligne).toContainText(titre);
    await expect(ligne.getByTestId('mailing-status-badge')).toContainText(/Simul/i);
  });

  test('envoi bloque sans objet ni message', async ({ page, baseURL }) => {
    const titre = `Mailing vide ${Date.now()}`;
    await preparer(page.request, baseURL!, titre, 1);
    await page.goto('/mailings/new');
    await page.getByTestId('mailing-activity').filter({ hasText: titre }).getByRole('checkbox').check();
    await page.getByTestId('mailing-submit').click();
    await expect(page).toHaveURL(/\/mailings\/new$/);
  });

  test('activite sans inscrit : aucun envoi possible (apercu a 0)', async ({ page, baseURL }) => {
    const titre = `Mailing zero ${Date.now()}`;
    await preparer(page.request, baseURL!, titre, 0);
    await page.goto('/mailings/new');
    await page.getByTestId('mailing-activity').filter({ hasText: titre }).getByRole('checkbox').check();
    await expect(page.getByTestId('mailing-recipients-preview')).toContainText('0');
    await page.getByTestId('mailing-subject').fill(`Zero ${Date.now()}`);
    await page.getByTestId('mailing-body').fill('Message');
    await expect(page.getByTestId('mailing-submit')).toBeDisabled();
  });

  test('@critical desabonnement : la page /u/:token inconnue affiche un message neutre', async ({ page }) => {
    await page.goto('/u/' + 'A'.repeat(43));
    await expect(page.getByTestId('unsubscribe-not-found')).toBeVisible();
  });
});

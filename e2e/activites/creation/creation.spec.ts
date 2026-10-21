import { test, expect } from '@playwright/test';

// Parcours critique : responsable connecte -> cree une activite -> l'ouvre -> le lien public est visible.
// Maquette : docs/mockup/v0.1.0/ui/espace_responsable__activites.html. Selecteurs : data-testid (liste dans
// _work/handoff/test-writer-*.md). Identifiants : E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD (defaut ADMIN_EMAIL / ADMIN_PASSWORD).

const email = process.env.E2E_ADMIN_EMAIL ?? process.env.ADMIN_EMAIL ?? '';
const password = process.env.E2E_ADMIN_PASSWORD ?? process.env.ADMIN_PASSWORD ?? '';

test.describe('Activites - creation @critical', () => {
  test.skip(!email || !password, 'E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD (ou ADMIN_*) requis');

  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('login-email').fill(email);
    await page.getByTestId('login-password').fill(password);
    await page.getByTestId('login-submit').click();
    await expect(page).toHaveURL(/\/activities$/);
  });

  test('@critical creer une activite, l\'ouvrir, voir le lien public', async ({ page }) => {
    const titre = `Stage judo E2E ${Date.now()}`;

    await page.getByTestId('activity-new-button').click();
    await expect(page).toHaveURL(/\/activities\/new$/);
    await page.getByTestId('activity-form-title').fill(titre);
    await page.getByTestId('activity-form-starts-at').fill('2026-12-28T14:00');
    await page.getByTestId('activity-form-capacity').fill('20');
    await page.getByTestId('activity-form-location').fill('Dojo municipal');
    await page.getByTestId('activity-form-description').fill('Apporter kimono et gourde.');
    await page.getByTestId('activity-form-submit').click();

    // Detail : brouillon, pas encore de lien partageable
    await expect(page).toHaveURL(/\/activities\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { name: titre })).toBeVisible();
    await expect(page.getByTestId('activity-status-badge')).toHaveText('Brouillon');
    await expect(page.getByTestId('activity-public-link')).toHaveCount(0);

    await page.getByTestId('activity-open-button').click();

    await expect(page.getByTestId('activity-status-badge')).toHaveText('Ouverte');
    const lien = page.getByTestId('activity-public-link');
    await expect(lien).toBeVisible();
    await expect(lien).toContainText(/\/a\/[0-9A-Za-z]{12}/);
    await expect(page.getByTestId('activity-close-button')).toBeVisible();
  });

  test('@critical l\'activite creee apparait dans la liste', async ({ page }) => {
    const titre = `Liste E2E ${Date.now()}`;
    await page.getByTestId('activity-new-button').click();
    await page.getByTestId('activity-form-title').fill(titre);
    await page.getByTestId('activity-form-starts-at').fill('2026-12-29T10:00');
    await page.getByTestId('activity-form-location').fill('Gymnase');
    await page.getByTestId('activity-form-submit').click();
    await expect(page).toHaveURL(/\/activities\/[0-9a-f-]{36}$/);

    await page.goto('/activities');
    await expect(page.getByTestId('activity-row').filter({ hasText: titre })).toBeVisible();
  });

  test('formulaire invalide : titre vide refuse, pas de creation', async ({ page }) => {
    await page.getByTestId('activity-new-button').click();
    await page.getByTestId('activity-form-location').fill('Gymnase');
    await page.getByTestId('activity-form-submit').click();
    await expect(page).toHaveURL(/\/activities\/new$/);
  });
});

test.describe('Connexion', () => {
  test('identifiants faux : message d\'erreur, reste sur /login', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('login-email').fill('inconnu@club.fr');
    await page.getByTestId('login-password').fill('mauvais-mot-de-passe');
    await page.getByTestId('login-submit').click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByTestId('login-error')).toBeVisible();
  });

  test('route protegee sans session : redirection vers /login', async ({ page }) => {
    await page.goto('/activities');
    await expect(page).toHaveURL(/\/login$/);
  });
});

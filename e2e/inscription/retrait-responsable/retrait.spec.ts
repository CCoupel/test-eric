import { test, expect, type Page } from '@playwright/test';

// Droit a l'effacement : un parent s'inscrit, le responsable retire l'inscrit depuis /activities/:id
// (DELETE /api/activities/:id/registrations/:registrationId), le compteur decroit et /r/:token devient neutre.
// Selecteurs data-testid : voir _work/handoff/test-writer-*.md (LOT-3).

const email = process.env.E2E_ADMIN_EMAIL ?? process.env.ADMIN_EMAIL ?? '';
const password = process.env.E2E_ADMIN_PASSWORD ?? process.env.ADMIN_PASSWORD ?? '';

async function connecter(page: Page) {
  await page.goto('/login');
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-password').fill(password);
  await page.getByTestId('login-submit').click();
  await expect(page).toHaveURL(/\/activities$/);
}

test.describe('Inscription - retrait par le responsable', () => {
  test.skip(!email || !password, 'E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD (ou ADMIN_*) requis');

  test('@critical le responsable retire un inscrit : compteur decremente, lien de gestion neutre', async ({ browser, page }) => {
    // 1. Responsable : creer et ouvrir l'activite
    const titre = `Retrait E2E ${Date.now()}`;
    await connecter(page);
    await page.getByTestId('activity-new-button').click();
    await page.getByTestId('activity-form-title').fill(titre);
    await page.getByTestId('activity-form-starts-at').fill('2026-12-28T14:00');
    await page.getByTestId('activity-form-capacity').fill('5');
    await page.getByTestId('activity-form-location').fill('Dojo municipal');
    await page.getByTestId('activity-form-submit').click();
    await expect(page).toHaveURL(/\/activities\/[0-9a-f-]{36}$/);
    const urlDetail = new URL(page.url()).pathname;
    await page.getByTestId('activity-open-button').click();
    await expect(page.getByTestId('activity-status-badge')).toHaveText('Ouverte');
    const lien = (await page.getByTestId('activity-public-link').textContent()) ?? '';
    const cheminPublic = lien.match(/\/a\/[0-9A-Za-z]{12}/)![0];

    // 2. Parent (contexte distinct, sans session) : s'inscrire
    const parent = await browser.newContext();
    const pageParent = await parent.newPage();
    await pageParent.goto(cheminPublic);
    await pageParent.getByTestId('register-who-minor').check();
    await pageParent.getByTestId('register-participant-name').fill('Leo Martin');
    await pageParent.getByTestId('register-contact-name').fill('Sophie Martin');
    await pageParent.getByTestId('register-contact-email').fill(`parent.${Date.now()}@example.org`);
    await pageParent.getByTestId('register-consent').check();
    await pageParent.getByTestId('register-submit').click();
    await expect(pageParent.getByTestId('register-confirmation')).toBeVisible();
    const cheminGestion = ((await pageParent.getByTestId('register-manage-url').textContent()) ?? '').match(/\/r\/[A-Za-z0-9_-]{43}/)![0];

    // 3. Responsable : voir l'inscrit, compteur a 1
    await page.goto(urlDetail);
    const ligne = page.getByTestId('registration-row').filter({ hasText: 'Leo Martin' });
    await expect(ligne).toBeVisible();
    await expect(page.getByTestId('activity-registrations-count')).toContainText('1');

    // 4. Retirer l'inscrit (confirmation dans la page)
    await ligne.getByTestId('registration-remove').click();
    await page.getByTestId('registration-remove-confirm').click();
    await expect(page.getByTestId('registration-row').filter({ hasText: 'Leo Martin' })).toHaveCount(0);
    await expect(page.getByTestId('activity-registrations-count')).toContainText('0');
    await page.reload();
    await expect(page.getByTestId('registration-row')).toHaveCount(0);

    // 5. Le lien de gestion du parent renvoie le message neutre
    await pageParent.goto(cheminGestion);
    await expect(pageParent.getByTestId('manage-not-found')).toBeVisible();
    await parent.close();
  });

  test('annuler la confirmation ne retire personne', async ({ browser, page }) => {
    const titre = `Annul E2E ${Date.now()}`;
    await connecter(page);
    await page.getByTestId('activity-new-button').click();
    await page.getByTestId('activity-form-title').fill(titre);
    await page.getByTestId('activity-form-starts-at').fill('2026-12-28T14:00');
    await page.getByTestId('activity-form-location').fill('Gymnase');
    await page.getByTestId('activity-form-submit').click();
    await expect(page).toHaveURL(/\/activities\/[0-9a-f-]{36}$/);
    const urlDetail = new URL(page.url()).pathname;
    await page.getByTestId('activity-open-button').click();
    const lien = (await page.getByTestId('activity-public-link').textContent()) ?? '';
    const parent = await browser.newContext();
    const pageParent = await parent.newPage();
    await pageParent.goto(lien.match(/\/a\/[0-9A-Za-z]{12}/)![0]);
    await pageParent.getByTestId('register-who-adult').check();
    await pageParent.getByTestId('register-participant-name').fill('Paul Durand');
    await pageParent.getByTestId('register-contact-email').fill(`paul.${Date.now()}@example.org`);
    await pageParent.getByTestId('register-consent').check();
    await pageParent.getByTestId('register-submit').click();
    await expect(pageParent.getByTestId('register-confirmation')).toBeVisible();
    await parent.close();

    await page.goto(urlDetail);
    await page.getByTestId('registration-row').filter({ hasText: 'Paul Durand' }).getByTestId('registration-remove').click();
    await page.getByTestId('registration-remove-cancel').click();
    await expect(page.getByTestId('registration-row').filter({ hasText: 'Paul Durand' })).toBeVisible();
  });
});

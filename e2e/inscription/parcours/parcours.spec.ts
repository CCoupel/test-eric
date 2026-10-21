import { test, expect } from '@playwright/test';

// Parcours critique : le responsable ouvre une activite -> un parent inscrit son enfant depuis /a/:slug ->
// confirmation avec le lien de gestion -> /r/:token : desinscription. Maquette : page_publique__inscription.html.
// Selecteurs data-testid : voir _work/handoff/test-writer-*.md (LOT-3).

const email = process.env.E2E_ADMIN_EMAIL ?? process.env.ADMIN_EMAIL ?? '';
const password = process.env.E2E_ADMIN_PASSWORD ?? process.env.ADMIN_PASSWORD ?? '';

test.describe('Inscription - parcours parent @critical', () => {
  test.skip(!email || !password, 'E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD (ou ADMIN_*) requis');

  async function ouvrirActivite(browser: import('@playwright/test').Browser, titre: string, places = '5') {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto('/login');
    await page.getByTestId('login-email').fill(email);
    await page.getByTestId('login-password').fill(password);
    await page.getByTestId('login-submit').click();
    await expect(page).toHaveURL(/\/activities$/);
    await page.getByTestId('activity-new-button').click();
    await page.getByTestId('activity-form-title').fill(titre);
    await page.getByTestId('activity-form-starts-at').fill('2026-12-28T14:00');
    await page.getByTestId('activity-form-capacity').fill(places);
    await page.getByTestId('activity-form-location').fill('Dojo municipal');
    await page.getByTestId('activity-form-submit').click();
    await expect(page).toHaveURL(/\/activities\/[0-9a-f-]{36}$/);
    await page.getByTestId('activity-open-button').click();
    await expect(page.getByTestId('activity-status-badge')).toHaveText('Ouverte');
    const lien = (await page.getByTestId('activity-public-link').textContent()) ?? '';
    const chemin = lien.match(/\/a\/[0-9A-Za-z]{12}/)?.[0];
    expect(chemin).toBeTruthy();
    await ctx.close();
    return chemin as string;
  }

  test('@critical inscrire un enfant, voir la confirmation, se desinscrire', async ({ browser, page }) => {
    const chemin = await ouvrirActivite(browser, `Parcours E2E ${Date.now()}`);
    const emailParent = `parent.${Date.now()}@example.org`;

    await page.goto(chemin);
    await expect(page.getByTestId('public-activity-title')).toBeVisible();
    await page.getByTestId('register-who-minor').check();
    await page.getByTestId('register-participant-name').fill('Leo Martin');
    await page.getByTestId('register-contact-name').fill('Sophie Martin');
    await page.getByTestId('register-contact-email').fill(emailParent);
    await page.getByTestId('register-consent').check();
    await page.getByTestId('register-submit').click();

    await expect(page.getByTestId('register-confirmation')).toBeVisible();
    const lienGestion = (await page.getByTestId('register-manage-url').textContent()) ?? '';
    expect(lienGestion).toMatch(/\/r\/[A-Za-z0-9_-]{43}/);

    await page.goto(lienGestion.match(/\/r\/[A-Za-z0-9_-]{43}/)![0]);
    await expect(page.getByTestId('manage-participant-name')).toHaveText(/Leo Martin/);
    await page.getByTestId('manage-unregister').click();
    if (await page.getByTestId('manage-unregister-confirm').count()) await page.getByTestId('manage-unregister-confirm').click();
    await expect(page.getByTestId('manage-unregistered')).toBeVisible();

    await page.reload();
    await expect(page.getByTestId('manage-not-found')).toBeVisible();
  });

  test('consentement non coche : inscription refusee', async ({ browser, page }) => {
    const chemin = await ouvrirActivite(browser, `Consent E2E ${Date.now()}`);
    await page.goto(chemin);
    await page.getByTestId('register-who-adult').check();
    await page.getByTestId('register-participant-name').fill('Paul Durand');
    await page.getByTestId('register-contact-email').fill(`paul.${Date.now()}@example.org`);
    await page.getByTestId('register-submit').click();
    await expect(page.getByTestId('register-confirmation')).toHaveCount(0);
  });

  test('activite complete : message et formulaire indisponible', async ({ browser, page }) => {
    const chemin = await ouvrirActivite(browser, `Complet E2E ${Date.now()}`, '1');
    await page.goto(chemin);
    await page.getByTestId('register-who-adult').check();
    await page.getByTestId('register-participant-name').fill('Premier');
    await page.getByTestId('register-contact-email').fill(`un.${Date.now()}@example.org`);
    await page.getByTestId('register-consent').check();
    await page.getByTestId('register-submit').click();
    await expect(page.getByTestId('register-confirmation')).toBeVisible();

    await page.goto(chemin);
    await expect(page.getByTestId('public-activity-full')).toBeVisible();
    await expect(page.getByTestId('register-submit')).toHaveCount(0);
  });

  test('lien de gestion inconnu : message neutre', async ({ page }) => {
    await page.goto('/r/' + 'A'.repeat(43));
    await expect(page.getByTestId('manage-not-found')).toBeVisible();
  });

  test('@mobile la page publique reste utilisable sur petit ecran', async ({ browser }) => {
    const chemin = await ouvrirActivite(browser, `Mobile E2E ${Date.now()}`);
    const ctx = await browser.newContext({ viewport: { width: 375, height: 667 } });
    const page = await ctx.newPage();
    await page.goto(chemin);
    await expect(page.getByTestId('register-submit')).toBeVisible();
    const debordement = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(debordement).toBe(false);
    await ctx.close();
  });
});

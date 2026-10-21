import { test, expect } from '@playwright/test';

// Smoke : une version qui demarre repond. Contrat : contracts/http-endpoints.md (GET /health).

test.describe('Socle - smoke', () => {
  test('@smoke GET /health repond 200 conforme au contrat', async ({ request }) => {
    const res = await request.get('/health');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.db).toBe('ok');
    expect(body.version).toMatch(/^\d+\.\d+\.\d+(\.\d+)?$/);
  });

  test("@smoke la page d'accueil repond et affiche du contenu", async ({ page }) => {
    const res = await page.goto('/');
    expect(res?.status()).toBe(200);
    await expect(page.locator('#root')).not.toBeEmpty();
  });

  test("@smoke la page d'accueil affiche la version de l'application", async ({ page, request }) => {
    const { version } = await (await request.get('/health')).json();
    await page.goto('/');
    await expect(page.locator('body')).toContainText(version);
  });

  test('@smoke une route SPA inconnue retombe sur la page applicative (fallback)', async ({ page }) => {
    const res = await page.goto('/une-route-front-inconnue');
    expect(res?.status()).toBe(200);
    await expect(page.locator('#root')).toBeAttached();
  });
});

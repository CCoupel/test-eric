import { defineConfig } from '@playwright/test';

// URL de l'application : E2E_BASE_URL (QUALIF, CI) sinon serveur local sur APP_PORT (defaut 3000).
const port = process.env.APP_PORT ?? '3000';
const externalUrl = process.env.E2E_BASE_URL;

// Serveur local lancé par Playwright : secrets et compte admin d'E2E (valeurs de test uniquement, jamais QUALIF/PROD).
// Posés dans process.env pour que le serveur ET les specs (workers) voient les mêmes identifiants.
if (!externalUrl) {
  process.env.SESSION_SECRET ??= 'e2e-only-session-secret-e2e-only-session-secret';
  process.env.ADMIN_EMAIL ??= 'e2e-admin@club.test';
  process.env.ADMIN_PASSWORD ??= 'e2e-Sup3r-Secret-Pass-9';
}

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: externalUrl ?? `http://localhost:${port}`,
    trace: 'retain-on-failure',
  },
  // Sans E2E_BASE_URL, lance l'application construite (npm run build prealable).
  webServer: externalUrl
    ? undefined
    : {
        command: 'npm run start',
        url: `http://localhost:${port}/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
});

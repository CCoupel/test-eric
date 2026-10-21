import { defineConfig } from '@playwright/test';

// URL de l'application : E2E_BASE_URL (QUALIF, CI) sinon serveur local sur APP_PORT (defaut 3000).
const port = process.env.APP_PORT ?? '3000';
const externalUrl = process.env.E2E_BASE_URL;

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

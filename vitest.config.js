import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/server/**/*.js'],
      reporter: ['text-summary', 'lcov'],
      // testing.coverage_min : la CI échoue sous 70 %
      thresholds: { lines: 70, branches: 70, functions: 70, statements: 70 },
    },
    projects: [
      {
        test: {
          name: 'server',
          environment: 'node',
          include: ['tests/server/**/*.test.js', 'tests/integration/**/*.test.js'],
          globalSetup: ['tests/server/global-setup.js'],
          fileParallelism: false,
          testTimeout: 30_000, // certains tests lancent `npm run data:purge` (démarrage npm lent sous Windows/WSL)
        },
      },
      'src/web/vite.config.ts',
    ],
  },
});

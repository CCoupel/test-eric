import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: { provider: 'v8', include: ['src/server/**/*.js'], reporter: ['text-summary', 'lcov'] },
    projects: [
      {
        test: {
          name: 'server',
          environment: 'node',
          include: ['tests/server/**/*.test.js'],
          globalSetup: ['tests/server/global-setup.js'],
          fileParallelism: false,
        },
      },
      'src/web/vite.config.ts',
    ],
  },
});

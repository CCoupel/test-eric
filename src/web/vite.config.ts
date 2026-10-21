import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const root = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(root, '../../package.json'), 'utf-8')) as { version: string };

export default defineConfig({
  root,
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/health': 'http://localhost:3000',
    },
  },
  build: { outDir: resolve(root, '../../dist/web'), emptyOutDir: true },
  test: {
    name: 'web',
    environment: 'jsdom',
    globals: true,
    setupFiles: [resolve(root, 'test-setup.ts')],
    include: ['**/*.test.{ts,tsx}'],
  },
});

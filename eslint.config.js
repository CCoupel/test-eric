import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default [
  { ignores: [
      'dist/', 'build/', 'coverage/', 'test-results/', 'playwright-report/', 'node_modules/', '.claude/',
      '_work/', 'MARKETING/', 'TEMPLATE_claude/',
    ] },
  js.configs.recommended,
  { files: ['**/*.js'], languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: globals.node } },
  // Frontend : TypeScript + React (src/web)
  ...tseslint.configs.recommended.map((c) => ({ ...c, files: ['src/web/**/*.{ts,tsx}'] })),
  {
    files: ['src/web/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: { globals: globals.browser },
    rules: reactHooks.configs.recommended.rules,
  },
  { files: ['src/web/vite.config.ts'], languageOptions: { globals: globals.node } },
];

import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/', 'coverage/', 'node_modules/', 'src/web/', '_work/', 'MARKETING/', 'TEMPLATE_claude/'] },
  js.configs.recommended,
  { files: ['**/*.js'], languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: globals.node } },
];

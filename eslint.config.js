import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import prettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';

export default [
  js.configs.recommended,
  ...tsPlugin.configs['flat/recommended'],
  prettierRecommended,
  {
    languageOptions: { globals: globals.node },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
    },
  },
  {
    files: ['ui/**/*.js'],
    languageOptions: { globals: globals.browser, sourceType: 'script' },
  },
];

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintReact from '@eslint-react/eslint-plugin';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import unusedImports from 'eslint-plugin-unused-imports';
import eslintPluginAstro from 'eslint-plugin-astro';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/*.config.js', '**/*.config.ts'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['packages/**/*.{ts,tsx}'],
    plugins: {
      'unused-imports': unusedImports,
    },
    rules: {
      '@typescript-eslint/array-type': ['error', { default: 'generic' }],
      '@typescript-eslint/no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-empty': 'off',
    },
  },
  {
    files: ['packages/backend/src/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  // Backend dependency-injection enforcement, see .claude/rules/backend-function-injection.md
  // Story 58.10 (2026-04-29): rule is 'error' across the entire backend (services/, api/, routes/). Allowlisted boot/test entry points (index.ts, env.ts, db/index.ts, test/) are allowed to import natives. Services + api + routes go through deps.fs / deps.shell / deps.db / deps.clock.
  {
    files: ['packages/backend/src/**/*.ts'],
    ignores: [
      'packages/backend/src/**/*.test.ts',
      'packages/backend/src/index.ts',
      'packages/backend/src/env.ts',
      'packages/backend/src/db/index.ts',
      'packages/backend/src/deps/**',
      'packages/backend/src/test/**',
    ],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [
          { name: 'child_process', message: 'Use deps.shell instead, see .claude/rules/backend-function-injection.md' },
          { name: 'node:child_process', message: 'Use deps.shell instead, see .claude/rules/backend-function-injection.md' },
          { name: 'fs', message: 'Use deps.fs instead, see .claude/rules/backend-function-injection.md' },
          { name: 'fs/promises', message: 'Use deps.fs instead, see .claude/rules/backend-function-injection.md' },
          { name: 'node:fs', message: 'Use deps.fs instead, see .claude/rules/backend-function-injection.md' },
          { name: 'node:fs/promises', message: 'Use deps.fs instead, see .claude/rules/backend-function-injection.md' },
          { name: '@shulkr/backend/db', importNames: ['db', 'sqlite'], message: 'Receive db/sqlite via deps, see .claude/rules/backend-function-injection.md' },
        ],
      }],
      'no-restricted-syntax': ['error',
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: 'Use deps.clock() instead, see .claude/rules/backend-function-injection.md',
        },
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'Use deps.clock() instead of new Date(), see .claude/rules/backend-function-injection.md',
        },
      ],
    },
  },
  {
    files: ['packages/frontend/src/**/*.{ts,tsx}'],
    ...eslintReact.configs['recommended-typescript'],
    plugins: {
      ...eslintReact.configs['recommended-typescript'].plugins,
      'react-hooks': reactHooksPlugin,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    rules: {
      ...eslintReact.configs['recommended-typescript'].rules,
      '@typescript-eslint/no-explicit-any': 'warn',
      '@eslint-react/hooks-extra/no-direct-set-state-in-use-effect': 'off',
      '@eslint-react/hooks-extra/exhaustive-deps': 'off',
      '@eslint-react/exhaustive-deps': 'off',
      '@eslint-react/no-array-index-key': 'off',
      '@eslint-react/dom/no-dangerously-set-innerhtml': 'off',
      '@eslint-react/web-api/no-leaked-timeout': 'off',
      '@eslint-react/web-api/no-leaked-timeouts': 'off',
      '@eslint-react/no-nested-component-definitions': 'off',
      '@eslint-react/dom-no-dangerously-set-innerhtml': 'off',
      '@eslint-react/web-api-no-leaked-timeout': 'off',
      '@eslint-react/set-state-in-effect': 'off',
      '@eslint-react/purity': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'off',
    },
  },
  ...eslintPluginAstro.configs.recommended,
  {
    files: ['packages/website/src/**/*.astro'],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
  {
    files: ['packages/shared/src/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  }
);

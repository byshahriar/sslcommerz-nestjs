import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import jsdoc from 'eslint-plugin-jsdoc';
import tseslint from 'typescript-eslint';

/**
 * Flat ESLint config.
 *
 * Two things are enforced beyond the usual: exported functions must document
 * their parameters and return values, and `any` is allowed only where the
 * NestJS decorator surface forces it.
 */

/** Where the full `@param`/`@returns` form is required; private members are exempt. */
const DOCUMENTED_CONTEXTS = [
  'FunctionDeclaration',
  'MethodDefinition:not([accessibility="private"]) > FunctionExpression',
  'PropertyDefinition:not([accessibility="private"]) > ArrowFunctionExpression',
];

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**'],
  },
  {
    rules: {
      // Nest's factory and decorator signatures are `any` by design.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': 'error',
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
    },
  },
  {
    files: ['src/**/*.ts'],
    plugins: { jsdoc },
    settings: {
      jsdoc: { mode: 'typescript', tagNamePreference: { template: 'typeParam' } },
    },
    rules: {
      'jsdoc/check-alignment': 'error',
      'jsdoc/check-param-names': ['error', { checkDestructured: false }],
      'jsdoc/check-tag-names': ['error', { typed: true }],
      'jsdoc/no-bad-blocks': 'error',
      'jsdoc/require-param-description': 'error',
      'jsdoc/require-returns-description': 'error',
      'jsdoc/require-param': ['error', { checkDestructured: false, contexts: DOCUMENTED_CONTEXTS }],
      'jsdoc/require-returns': ['error', { contexts: DOCUMENTED_CONTEXTS }],
    },
  },
  {
    files: ['test/**/*.ts'],
    rules: {
      // Test doubles cast freely; that is the point of a double.
      '@typescript-eslint/no-unsafe-function-type': 'off',
    },
  },
];

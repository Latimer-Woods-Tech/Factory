import tseslint from 'typescript-eslint';
import lwt from './plugins/lwt.js';

const RESTRICTED_MODULES = [
  'node:crypto',
  'node:fs',
  'node:path',
  'node:buffer',
  'express',
  'fastify',
  'next',
];

const RESTRICTED_GLOBALS = ['Buffer', '__dirname', '__filename', 'require'];

export default [
  ...tseslint.configs.recommended,
  {
    plugins: { lwt },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: RESTRICTED_MODULES.map((name) => ({
            name,
            message: `Use Web/CF APIs or @latimer-woods-tech/* instead of ${name}.`,
          })),
        },
      ],
      'no-restricted-globals': [
        'error',
        ...RESTRICTED_GLOBALS.map((name) => ({
          name,
          message: `${name} is not available in the Cloudflare Workers runtime.`,
        })),
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "MemberExpression[object.name='process'][property.name='env']",
          message: 'Use c.env / env.* (Cloudflare bindings), never process.env.',
        },
      ],
      'lwt/no-console': 'error',
      'lwt/no-raw-error-throw': 'error',
      'lwt/idempotent-webhooks': 'warn',
      'lwt/require-request-id': 'warn',
      'lwt/no-hardcoded-stripe-price': 'error',
    },
  },
];

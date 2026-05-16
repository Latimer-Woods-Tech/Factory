import { RuleTester } from 'eslint';
import tsParser from '@typescript-eslint/parser';

export const tester = new RuleTester({
  languageOptions: {
    parser: tsParser,
    ecmaVersion: 2022,
    sourceType: 'module',
  },
});

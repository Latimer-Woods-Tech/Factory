import tsParser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';

const inputOrTextareaSelector = "JSXOpeningElement[name.name=/^(input|textarea)$/]";
const classNameWithSmallTextSelector =
  "JSXAttribute[name.name='className'][value.type='Literal'][value.value=/\\btext-(xs|sm)\\b/]:not([value.value=/\\bmd:text-[^\\s\"']+/])";
const inputTextTooSmallSelector = `${inputOrTextareaSelector} > ${classNameWithSmallTextSelector}`;

export default [
  {
    files: ['src/**/*.{ts,tsx}'],
    linterOptions: {
      reportUnusedDisableDirectives: 'off',
    },
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'off',
      'no-restricted-syntax': [
        'error',
        {
          selector: inputTextTooSmallSelector,
          message:
            'Inputs and textareas using text-xs/text-sm must include an md: text-size override (for example `text-base md:text-sm`) to prevent iOS focus zoom.',
        },
      ],
    },
  },
];

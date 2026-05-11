import { describe, it } from 'vitest';
import plugin from '../plugins/lwt.js';
import { tester } from './_tester';

describe('lwt/no-raw-error-throw', () => {
  it('runs', () => {
    tester.run('no-raw-error-throw', plugin.rules['no-raw-error-throw'], {
      valid: [{ code: "import { AppError } from '@latimer-woods-tech/errors'; throw new AppError('x');" }],
      invalid: [{ code: "throw new Error('boom')", errors: 1 }],
    });
  });
});

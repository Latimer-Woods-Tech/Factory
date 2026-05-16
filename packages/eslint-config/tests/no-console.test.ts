import { describe, it } from 'vitest';
import plugin from '../plugins/lwt.js';
import { tester } from './_tester';

describe('lwt/no-console', () => {
  it('runs', () => {
    tester.run('no-console', plugin.rules['no-console'], {
      valid: [{ code: "import { log } from '@latimer-woods-tech/logger'; log.info('x');" }],
      invalid: [
        { code: "console.log('x')", errors: 1 },
        { code: "globalThis.console.warn('x')", errors: 1 },
      ],
    });
  });
});

import { describe, it } from 'vitest';
import plugin from '../plugins/lwt.js';
import { tester } from './_tester';

describe('lwt/require-request-id', () => {
  it('runs', () => {
    tester.run('require-request-id', plugin.rules['require-request-id'], {
      valid: [
        { code: "const app = new Hono(); app.use(requestId());" },
        { code: "const x = 1;" },
      ],
      invalid: [
        { code: "const app = new Hono(); app.get('/', (c) => c.text('hi'))", errors: 1 },
        {
          // requestId registered on a different object should not count
          code: "const app = new Hono(); const other = {}; other.use(requestId()); app.get('/', (c) => c.text('hi'))",
          errors: 1,
        },
      ],
    });
  });
});

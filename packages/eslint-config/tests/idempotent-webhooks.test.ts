import { describe, it } from 'vitest';
import plugin from '../plugins/lwt.js';
import { tester } from './_tester';

describe('lwt/idempotent-webhooks', () => {
  it('runs', () => {
    tester.run('idempotent-webhooks', plugin.rules['idempotent-webhooks'], {
      valid: [
        { code: "app.post('/webhook/stripe', withIdempotency(async (c) => c.text('ok')))" },
        { code: "app.post('/users', async (c) => c.json({}))" },
      ],
      invalid: [
        { code: "app.post('/webhook/stripe', async (c) => c.text('ok'))", errors: 1 },
      ],
    });
  });
});

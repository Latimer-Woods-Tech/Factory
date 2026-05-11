import { describe, it } from 'vitest';
import plugin from '../plugins/lwt.js';
import { tester } from './_tester';

describe('lwt/no-hardcoded-stripe-price', () => {
  it('runs', () => {
    tester.run('no-hardcoded-stripe-price', plugin.rules['no-hardcoded-stripe-price'], {
      valid: [{ code: "const id = c.env.STRIPE_PRICE_PRO;" }],
      invalid: [{ code: "const id = 'price_1A2b3C4d5E6f7G';", errors: 1 }],
    });
  });
});

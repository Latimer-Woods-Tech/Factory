# @latimer-woods-tech/eslint-config

Shared ESLint 9 flat config for the Latimer-Woods-Tech Cloudflare Workers monorepo.

## Install

```sh
pnpm add -D @latimer-woods-tech/eslint-config eslint typescript-eslint
```

## Use

```js
// eslint.config.js
import lwt from '@latimer-woods-tech/eslint-config';
export default [...lwt];
```

## Enforces

- No `node:crypto`, `node:fs`, `node:path`, `node:buffer`, `express`, `fastify`, `next`
- No `Buffer`, `__dirname`, `__filename`, `require`, `process.env`
- `lwt/no-console` — use `@latimer-woods-tech/logger`
- `lwt/no-raw-error-throw` — use `@latimer-woods-tech/errors`
- `lwt/idempotent-webhooks` — webhook routes must use `withIdempotency`
- `lwt/require-request-id` — Hono apps must register request-id middleware
- `lwt/no-hardcoded-stripe-price` — no `price_*` literals

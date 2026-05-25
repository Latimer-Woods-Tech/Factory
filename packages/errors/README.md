# @latimer-woods-tech/errors

> Typed, retryable-aware error classes and a Hono error-boundary middleware. Built for Cloudflare Workers.

JavaScript's built-in `Error` carries a string and a stack trace. That isn't enough for a network service: you need an HTTP status code, a stable machine-readable code, a hint about whether the failure is worth retrying, and structured context that survives JSON serialization for log forwarders. This package supplies that, plus a drop-in [Hono](https://hono.dev/) middleware that turns thrown errors into consistent JSON envelopes.

It is **zero-dependency** on application code (only Hono's peer types) and **runs unchanged in Cloudflare Workers, Node.js, Bun, and Deno** — no `fs`, no `path`, no `Buffer`, no `process.env`.

## Installation

```bash
npm install @latimer-woods-tech/errors
```

Peer-requires `hono@^4` if you use `withErrorBoundary`.

## Quick start

```ts
import { Hono } from 'hono';
import { NotFoundError, withErrorBoundary } from '@latimer-woods-tech/errors';

const app = new Hono();
app.use('*', withErrorBoundary());
app.get('/widgets/:id', (c) => {
  throw new NotFoundError('Widget not found', { id: c.req.param('id') });
});
// → HTTP 404 { "data": null, "error": { "code": "NOT_FOUND", "message": "Widget not found", "status": 404, "retryable": false, "context": { "id": "..." } } }
```

## API reference

### `FactoryBaseError`

The root class every typed error extends. Subclass it for domain-specific errors of your own.

```ts
new FactoryBaseError(code: string, message: string, status: number, retryable?: boolean, context?: Record<string, unknown>)
```

Carries five fields beyond a plain `Error`:

- `code` — stable machine-readable string (e.g. `"DB_QUERY_FAILED"`). Safe to switch on in client code.
- `message` — human-readable text. Safe to log; assume it may be shown to end users.
- `status` — HTTP status code (`number`). Used by `withErrorBoundary` when serializing.
- `retryable` — `boolean` hint for clients and queue workers. `true` for transient failures (rate limits, upstream timeouts); `false` for permanent ones (validation, auth).
- `context` — optional `Record<string, unknown>` for structured detail. Survives JSON serialization untouched.

```ts
class StripeWebhookInvalidError extends FactoryBaseError {
  constructor(eventId: string) {
    super('STRIPE_WEBHOOK_INVALID', 'Webhook signature did not verify', 400, false, { eventId });
  }
}
```

### Built-in subclasses

| Class                | Code                   | Status | Retryable | Use for                                          |
| -------------------- | ---------------------- | -----: | --------: | ------------------------------------------------ |
| `BadRequestError`    | `BAD_REQUEST`          |    400 |     false | Malformed request, missing parameters            |
| `AuthError`          | `AUTH_TOKEN_INVALID`   |    401 |     false | Missing / invalid / expired credentials          |
| `ForbiddenError`     | `AUTH_FORBIDDEN`       |    403 |     false | Authenticated but not authorized                 |
| `NotFoundError`      | `NOT_FOUND`            |    404 |     false | Resource does not exist                          |
| `ValidationError`    | `VALIDATION_ERROR`     |    422 |     false | Typed constraint violation (use over 400)        |
| `RateLimitError`     | `RATE_LIMITED`         |    429 |      true | Rate-limit / quota exhausted                     |
| `InternalError`      | `INTERNAL_ERROR`       |    500 |      true | Unexpected server failure (default fallback)     |

Each takes `(message?, context?)`:

```ts
throw new ValidationError('Email is required', { field: 'email' });
throw new RateLimitError('Too many requests', { retryAfterSeconds: 30 });
```

### `ErrorCodes`

A frozen constant object of every code string this package emits. Use it instead of hard-coding strings:

```ts
import { ErrorCodes } from '@latimer-woods-tech/errors';

if (response.error?.code === ErrorCodes.RATE_LIMITED) {
  await sleep(response.error.context?.retryAfterSeconds ?? 1);
}
```

Exports include auth, database, LLM, telephony, Stripe, and generic codes. Full list lives in [`src/index.ts`](./src/index.ts).

### `isFactoryError(value): value is FactoryBaseError`

Narrow `unknown` to a typed error in a `catch`. Returns `true` for anything that inherits from `FactoryBaseError`, `false` for plain `Error` or non-errors.

```ts
try {
  await doWork();
} catch (err) {
  if (isFactoryError(err) && err.retryable) {
    return enqueueRetry();
  }
  throw err;
}
```

### `toErrorResponse(err: unknown, requestId?: string): FactoryResponse<never>`

Serializes any thrown value into the standard response envelope:

```ts
{
  data: null,
  error: {
    code: string,
    message: string,
    status: number,
    retryable: boolean,
    context?: Record<string, unknown>
  },
  meta?: { requestId, duration, timestamp }
}
```

Accepts anything: `FactoryBaseError` (preserved fully), plain `Error` (mapped to `INTERNAL_ERROR`/500), or a non-error value like a string or object (wrapped under `context.value`). The `meta` field is only attached when a `requestId` is supplied — useful for log correlation.

```ts
ctx.waitUntil(logForwarder.send(toErrorResponse(err, requestId)));
```

### `withErrorBoundary(): MiddlewareHandler`

Hono middleware that converts uncaught errors in any downstream handler into a `toErrorResponse` JSON body with the correct HTTP status. Handles both the propagating `try/catch` path and the post-`next()` `c.error` path that Hono 4.x's compose function uses.

Reads `requestId` from `c.get('requestId')` if a prior middleware set it, and includes it in the response `meta`.

```ts
import { Hono } from 'hono';
import { withErrorBoundary } from '@latimer-woods-tech/errors';

const app = new Hono();
app.use('*', async (c, next) => {
  c.set('requestId', crypto.randomUUID());
  await next();
});
app.use('*', withErrorBoundary());
```

## Patterns

### Operational vs programmer errors

A clean rule: **operational** errors are expected runtime failures the caller can do something about (validation, auth, rate limits, upstream outages) — these should be `FactoryBaseError` subclasses with `retryable` set honestly. **Programmer** errors (null deref, type confusion, bad logic) should remain plain `Error`s — they crash to 500 via `INTERNAL_ERROR` and you fix the code. `isFactoryError` is the seam between the two.

### Error chaining (`cause`)

To preserve an underlying error while throwing a typed one, use the ES2022 `cause` option:

```ts
try {
  await db.query(sql);
} catch (dbErr) {
  throw new InternalError('Failed to load user', { userId });
  // or with cause:
  // throw Object.assign(new InternalError('...'), { cause: dbErr });
}
```

The cause survives `error.stack` but is **not** serialized by `toErrorResponse` (it would leak internals). Log the original separately.

### Serializing to JSON for log forwarders

`toErrorResponse(err)` is JSON-serializable as-is. Pipe its output straight into Logflare, Sentry breadcrumbs, Datadog logs, or `console.log` — no `error.toJSON()` shim needed, no circular reference traps.

### Distinguishing retryable failures in queue workers

```ts
if (isFactoryError(err) && err.retryable) {
  await env.QUEUE.send(message, { delaySeconds: backoff(attempt) });
  return;
}
// Permanent failure → dead-letter
await env.DLQ.send({ message, error: toErrorResponse(err) });
```

## Cloudflare Workers compatibility

This is the differentiator. Most error libraries reach for Node built-ins (`fs`, `path`, `inspect`) or assume a long-lived process. This one uses only:

- The ES2022 `Error` class
- The Web Crypto-compatible `captureStackTrace` (feature-detected, optional)
- Standard `Date` / `JSON`

No `Buffer`, no `process.env`, no Node `crypto`, no `require()`. tsup ships `format: 'esm'` and `platform: 'neutral'` — the published bundle works unchanged in Workers, Bun, Deno, and Node.js ≥18.

## Why I built this

Every Worker I write ends up needing the same five things: a stable error code so the client can switch on it, an HTTP status so the boundary knows what to return, a retryable hint so queue handlers don't infinite-loop on a 422, structured context that survives the JSON wire, and a single middleware that catches everything and emits the same envelope shape. Existing libraries either ship a kitchen sink of Node-specific machinery or stop at "extend Error and add a code." This package is the minimum useful thing — and the maximum portable one. It's the foundation we build every Cloudflare Worker on, so it's also the cleanest piece of the stack to open-source first.

## License

MIT — see [LICENSE](./LICENSE).

## Contributing

Issues and PRs welcome at [github.com/Latimer-Woods-Tech/Factory](https://github.com/Latimer-Woods-Tech/Factory). Please run `npm run build && npm test` before opening a PR; the package holds itself to TypeScript-strict, zero-lint-warnings, and 90% line coverage.

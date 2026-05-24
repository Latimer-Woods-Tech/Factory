# Changelog

All notable changes to `@latimer-woods-tech/errors` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-05-23

First public release. Previously published internally only.

### Added

- `FactoryBaseError` — root class with `code`, `message`, `status`, `retryable`, and optional `context` fields. Feature-detects `Error.captureStackTrace`.
- Typed subclasses for the seven most common HTTP failure modes:
  - `BadRequestError` (400, not retryable)
  - `AuthError` (401, not retryable)
  - `ForbiddenError` (403, not retryable)
  - `NotFoundError` (404, not retryable)
  - `ValidationError` (422, not retryable)
  - `RateLimitError` (429, retryable)
  - `InternalError` (500, retryable)
- `ErrorCodes` — frozen constant map of every error code string the package emits, covering auth, database, LLM, telephony, Stripe, and generic codes.
- `isFactoryError(value)` — type-guard for narrowing `unknown` to `FactoryBaseError` in `catch` blocks.
- `toErrorResponse(err, requestId?)` — serializer that maps any thrown value (typed error, plain `Error`, primitive, or object) into a `FactoryResponse<never>` envelope with `data`, `error`, and optional `meta` fields.
- `withErrorBoundary()` — Hono middleware that catches uncaught errors in route handlers (both propagating throws and Hono 4.x's `c.error` post-`next()` path) and emits a `toErrorResponse` JSON body with the correct HTTP status. Pulls `requestId` from `c.get('requestId')` if set.
- `FactoryResponse<T>`, `FactoryErrorShape`, `ErrorContext`, `ErrorCode` — public TypeScript types.

### Compatibility

- ESM-only. Ships a single bundle via tsup with `platform: 'neutral'`.
- Runs unchanged in Cloudflare Workers, Bun, Deno, and Node.js ≥18 — no Node built-ins, no `process.env`, no `Buffer`.
- Peer-compatible with Hono ≥4 (only required if you use `withErrorBoundary`).

[Unreleased]: https://github.com/Latimer-Woods-Tech/Factory/compare/errors-v0.1.0...HEAD
[0.1.0]: https://github.com/Latimer-Woods-Tech/Factory/releases/tag/errors-v0.1.0

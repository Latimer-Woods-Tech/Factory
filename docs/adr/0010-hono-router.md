# 0010: Hono as the HTTP router

**Date:** 2026-01-01  **Status:** Accepted

## Context
Workers need an HTTP router.

## Decision
All Workers use Hono. No exceptions.

## Consequences
- Consistent routing API across all 11 apps
- `AppEnv` generic provides TypeScript type safety for env bindings
- `c.env` is the only way to access bindings — never `process.env`

## Alternatives considered
- **Itty Router:** worse TypeScript support, no middleware system
- **Raw Request/Response:** reinvents routing for every app

# 0009: Cloudflare Workers as the only runtime

**Date:** 2026-01-01  **Status:** Accepted

## Context
The factory needs to run 11+ apps with minimal ops overhead across global regions.

## Decision
All application code runs exclusively on Cloudflare Workers. No Node servers, no Docker, no Lambda.

## Consequences
- Sub-millisecond cold starts globally
- No Node built-ins (`fs`, `Buffer`, `path`, `node:crypto`) — Web APIs only
- All packages must be Workers-compatible: ESM, no Node-specific APIs

## Alternatives considered
- **Node + Render/Fly:** container management overhead, slower cold starts
- **Lambda:** AWS lock-in, cold start variance

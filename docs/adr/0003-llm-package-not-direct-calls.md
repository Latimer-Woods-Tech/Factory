# 0003: LLM calls via @latimer-woods-tech/llm, not direct provider APIs

**Date:** 2026-04-30  **Status:** Accepted

## Context
Multiple workers need LLM access. Options: call Anthropic/Groq/Gemini directly, or use the shared package.

## Decision
All LLM calls go through `@latimer-woods-tech/llm`. Direct provider API calls are prohibited.

## Consequences
- All provider traffic flows through Cloudflare AI Gateway (`AI_GATEWAY_BASE_URL`)
- Workload-split routing: Haiku for fast, Sonnet for balanced, Gemini fallback for long-context
- `llm-meter` records every call to D1 for cost tracking
- Breaking changes in the package affect all consumers simultaneously (see 2026-05-02 incident)

## Alternatives considered
- **Direct provider calls:** faster to implement, but no unified cost tracking, no failover, no caching

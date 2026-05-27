# Changelog

## 0.3.2 — 2026-05-27

### Added (no breaking changes)

- **`LLMOptions.workload`** — optional string label (`'insights'`, `'copy'`, `'lead-qualification'`, …)
  forwarded to cost-recording calls for per-workload cost attribution in dashboards.
- **Missing model pricing entries** in `MODEL_PRICE_PER_1M`:
  `claude-haiku-4-5-20251001`, `claude-sonnet-4-20250514`, `claude-opus-4-20250514`
  (aliases for variants that share pricing with their shorthand names; prevents
  `estimateCostUsd` from silently returning `$0` for these model IDs).
- **`workload` forwarded** to `recordOrgCostUsage` so per-workload breakdowns appear
  in the cost-tracking KV store.

### Consumers

- Existing callers do not need to set `workload`; it is optional and defaults to `undefined`.
- The `recordOrgCostUsage` signature is unchanged; `workload` is an additive internal field.

---

## 0.3.1 — 2026-05-02 PM

### Added (no breaking changes)

- **Grok opt-in provider.** `LLMProvider` now includes `'grok'`. Call with `{ model: 'grok-4-fast' }` or `{ model: 'grok-3-mini-latest' }` to route to xAI. Not in default tier routing — explicit model override only.
- `LLMEnv.GROK_API_KEY` is **optional**; required only when a caller opts in via a `grok-*` model override.
- `MODELS.grok.{fast, mini}` added to the catalogue.

### Rationale

Reversal of the 0.3.0 partial decision (D1 in `docs/supervisor/DECISIONS.md`): Grok stays available for workloads that benefit from its quirks — cheap experimental prompting in the xico-city user economy, artist-platform surface, etc. It does not compete with Anthropic / Gemini / Groq for the tier slots; it sits alongside as a per-call opt-in.

### Consumers

- Downstream packages do not need to declare `GROK_API_KEY` unless a route explicitly sends Grok model overrides. Existing code that dropped the key on 0.3.0 migration continues to work.


## 0.3.0 — 2026-05-02

### Breaking

- **Grok removed.** `LLMProvider` no longer includes `grok`; `LLMEnv.GROK_API_KEY` removed.
- **AI Gateway mandatory.** `LLMEnv.AI_GATEWAY_BASE_URL` is required. All provider traffic flows through
  Cloudflare AI Gateway for unified logging, rate limiting, and cost telemetry.
- **Tier-based routing.** `LLMOptions.tier` (`fast | balanced | smart | verifier`) replaces the
  flat Anthropic → Grok → Groq failover chain. Routing is workload-split:
  - `fast` → Anthropic Haiku (latency-sensitive, short completions)
  - `balanced` → Anthropic Sonnet (default)
  - `smart` → Anthropic Opus; Gemini 2.5 Pro for long-context (>150k tokens est.)
  - `verifier` → Groq Llama 3.3 70B (cheap second opinion, no fallback)
- **Dependency declarations fixed.** `@latimer-woods-tech/errors` and `@latimer-woods-tech/logger`
  now declared as `^0.2.0` instead of `file:../*` so external consumers can install the package.

### Added

- Gemini 2.5 Pro via Vertex AI as long-context fallback (`VERTEX_ACCESS_TOKEN`, `VERTEX_PROJECT`, `VERTEX_LOCATION`).
- Anthropic prompt caching (auto-enabled for system prompts ≥ 4096 chars; override via `LLMOptions.promptCache`).
- Per-call cancellation via `LLMOptions.signal: AbortSignal`.
- 3-attempt exponential backoff (250ms · 2^n + jitter) on retryable status (408, 425, 429, 5xx).
- Ledger stamping: `LLMOptions.{runId, project, actor}` propagated to logger for downstream
  consumption by `@latimer-woods-tech/llm-meter`.
- `LLMResult.{model, tier, attempts, gatewayRequestId, tokens.cacheRead, tokens.cacheWrite}` for
  observability and budget accounting.

### Changed

- Default model constants renamed and grouped under exported `MODELS` catalogue. Kept in sync with
  `docs/architecture/FACTORY_V1.md § LLM substrate`.
- Empty provider responses now surface as leg failures and trigger fallback rather than returning
  an empty `LLMResult`.

### Migration

Replace:

```ts
const res = await complete(msgs, { ANTHROPIC_API_KEY, GROK_API_KEY, GROQ_API_KEY }, { model: 'claude-sonnet-4-...' });
```

With:

```ts
const res = await complete(
  msgs,
  {
    AI_GATEWAY_BASE_URL: env.AI_GATEWAY_BASE_URL,
    ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY,
    GROQ_API_KEY: env.GROQ_API_KEY,
    VERTEX_ACCESS_TOKEN: env.VERTEX_ACCESS_TOKEN, // minted via JWT-bearer flow
    VERTEX_PROJECT: env.VERTEX_PROJECT,
    VERTEX_LOCATION: env.VERTEX_LOCATION,
  },
  { tier: 'balanced', runId, project: 'prime-self', actor: 'worker' },
);
```

## 0.2.0

Initial public release of the failover orchestrator.

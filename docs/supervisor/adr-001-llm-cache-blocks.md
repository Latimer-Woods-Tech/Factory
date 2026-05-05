# ADR-001: Multi-Block Prompt Cache Structure for Supervisor LLM Calls

**Status:** Accepted  
**Date:** 2026-05-05  
**Author:** @copilot  
**Gates:** SUP-3.5 (`POST /run` LLM implementation)  
**Supersedes:** —

---

## Context

Anthropic supports up to **4 cache breakpoints per request**, each with an independent
5-minute TTL. When SUP-3.5 wires actual LLM calls into the supervisor for slot-filling
and plan parameterization, the prompt block boundaries must be defined upfront.
Retrofitting cache breakpoints after the fact is error-prone and causes cache misses on
every refactor.

The goal: put the highest-reuse, largest content in the earliest blocks so cache hits
are maximized on the tokens that cost the most to re-send.

The current `buildAnthropicRequest()` implementation in `packages/llm/src/index.ts`
(lines 165–194) auto-applies `cache_control: { type: 'ephemeral' }` to the system
prompt when `sys.length >= 4096` or `opts.promptCache === true`. The supervisor prompt
builder must work within this contract.

---

## Decisions

### Decision 1 — Block 1 content boundary

**Resolved:** Use `docs/supervisor/STANDING_ORDERS.md` (created in this PR) as the
exclusive Block 1 source.

**Rationale:**  
`FRIDGE.md` (3,920 chars / ~980 tokens) mixes actionable rules with explanatory prose
("Why this is on the fridge", "How decisions happen") that is not useful to an LLM
executing a run. A tighter file that captures only the ten non-negotiable operating
rules, the technical hard constraints, trust tiers, issue safety rules, and escalation
path keeps Block 1 under 2,000 tokens and is easy to audit when rules change.

`CLAUDE.md` (12,329 chars / ~3,082 tokens) contains the full package matrix, active
app table, and extensive narrative — most of which is redundant when the capability
registry is already in Block 2. Sending all of CLAUDE.md would double Block 1 cost
for marginal benefit.

`STANDING_ORDERS.md` (**7,200 chars / ~1,800 tokens**) is the canonical source. Its
content changes only when a rule itself changes — effectively never during normal
operations.

> ⚠️ **Auto-cache threshold note:** `buildAnthropicRequest()` auto-applies
> `cache_control` when `sys.length >= 4096`. STANDING_ORDERS.md (7,200 chars) exceeds
> this threshold, so Block 1 will be auto-cached without requiring explicit
> `promptCache: true`. However, `buildSupervisorPrompt()` MUST pass
> `promptCache: true` as a defensive measure to guarantee caching if content length
> ever drifts below 4,096 during future edits.

---

### Decision 2 — Block 2 freshness

**Resolved:** Re-read `capabilities.yml` per run.

**Rationale:**  
Loading once at Worker cold-start risks stale data after a re-deploy. A Cloudflare
Worker may have a cold-start TTL of minutes to hours; if capabilities change during
that window, the supervisor would operate on a stale registry.

Anthropic's 5-minute cache TTL means a re-deploy only busts the Block 2 cache once.
Subsequent supervisor runs within the same 5-minute window still get a cache hit.
The marginal cost of one extra R2/KV file read per run is negligible compared to
stale-capability risk, which could cause the supervisor to invoke non-existent tools.

> **Note:** `capabilities.yml` is a Red-tier file. The supervisor reads it but must
> never modify it directly. Changes to the registry require CODEOWNER review.

---

### Decision 3 — Block 3 scope

**Resolved:** Send the full `docs/supervisor/plans/*.yml` directory (all templates,
concatenated) in Block 3 as a single static block.

**Rationale:**  
Narrowing to only the candidate templates that pass `matchTemplate()` would change the
cache key per issue type, causing per-request cache fragmentation. Each unique subset
of templates would require its own cache write, negating the savings.

Sending the full library (currently 9 templates, ~24,182 chars / ~6,045 tokens) gives
a stable cache key on every call regardless of which issue type is being processed.
The LLM selects the appropriate template from the full menu. Template count is expected
to grow slowly; at 20+ templates Block 3 will still be within practical bounds.

> **Concatenation order:** Templates must be concatenated in **lexicographic filename
> order** for a deterministic, stable cache key across all Workers instances.

---

## Block Structure

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Block 1  [cache_control: ephemeral]                                     │
│ Standing orders + technical hard constraints                            │
│ Source:        docs/supervisor/STANDING_ORDERS.md                       │
│ Size:          7,200 chars / ~1,800 tokens                              │
│ Reuse:         every call                                               │
│ Invalidation:  only when a rule in STANDING_ORDERS.md changes           │
├─────────────────────────────────────────────────────────────────────────┤
│ Block 2  [cache_control: ephemeral]                                     │
│ Capability registry                                                     │
│ Source:        capabilities.yml (root, re-read per run)                 │
│ Size:          ~6,000 chars / ~1,500 tokens (file not yet authored)     │
│ Reuse:         every call                                               │
│ Invalidation:  on deploy of any app that adds or removes a capability   │
├─────────────────────────────────────────────────────────────────────────┤
│ Block 3  [cache_control: ephemeral]                                     │
│ Template library                                                        │
│ Source:        docs/supervisor/plans/*.yml (all, lexicographic order)   │
│ Size:          24,182 chars / ~6,045 tokens (9 templates, 2026-05-05)   │
│ Reuse:         most calls                                               │
│ Invalidation:  when any template is added, removed, or edited           │
├─────────────────────────────────────────────────────────────────────────┤
│ Block 4  [no cache]                                                     │
│ Current task                                                            │
│ Source:        incoming issue body + extracted slot values              │
│ Size:          ~800–2,000 chars / ~200–500 tokens (unique per run)      │
│ Reuse:         never — unique per run                                   │
└─────────────────────────────────────────────────────────────────────────┘
```

**Total cached chars per request (blocks 1–3):** ~37,382 chars / ~9,345 tokens  
**Block 4 (uncached):** ~800–2,000 chars / ~200–500 tokens

---

## Auto-Cache Threshold Audit

The 4,096-char threshold in `buildAnthropicRequest()` (`packages/llm/src/index.ts:180`)
determines whether `cache_control` is applied automatically:

| Block | Source | Chars | Above 4,096? | Action required |
|-------|--------|-------|--------------|-----------------|
| 1 | STANDING_ORDERS.md | 7,200 | ✅ Yes | None; also pass `promptCache: true` defensively |
| 2 | capabilities.yml | ~6,000 (est.) | ✅ Yes | Verify after `capabilities.yml` is authored |
| 3 | plans/*.yml (all) | 24,182 | ✅ Yes | None |
| 4 | Issue + slots | ~800–2,000 | ❌ No | `cache: false` — never cache Block 4 |

---

## Cache Economics

Pricing reference: Anthropic Claude Sonnet 4 (approximate, subject to change).

| Token type | Price per million |
|------------|------------------|
| Input | $3.00 |
| Cache write | $3.75 |
| Cache read | $0.30 |

| Scenario | Tokens/call | Cost/call | Cost @ 100 calls/day |
|----------|-------------|-----------|----------------------|
| No cache | ~9,345 + ~350 = ~9,695 | ~$0.029 | ~$2.91 |
| 90% cache hit on blocks 1–3 | ~935 write + ~8,410 read + ~350 input | ~$0.007 | ~$0.71 |
| **Savings** | — | **~76%** | **~$2.20/day** |

At 10,000 calls/day the cache savings exceed $220/day. The pattern is load-bearing
at scale even if negligible at current volume.

---

## TypeScript Type Signature

The following types and function signature are defined here.
**Implementation is deferred to SUP-3.5** — no LLM call code should be written
in the supervisor before this ADR is merged.

```typescript
/**
 * A single content block in the Anthropic multi-block prompt structure.
 *
 * Maps directly to an Anthropic API `system` array entry with an optional
 * `cache_control` annotation. Anthropic enforces a maximum of 4 cache
 * breakpoints per request.
 */
export interface CacheBlock {
  /**
   * Human-readable label used in logs and metrics.
   * This value is NOT sent to the LLM.
   */
  label: string;

  /** Text content of the block, sent verbatim to the LLM. */
  content: string;

  /**
   * Whether to attach `cache_control: { type: 'ephemeral' }` to this block.
   *
   * Blocks whose `content` is below 4,096 characters are not auto-cached by
   * `buildAnthropicRequest()`; set this to `true` on Block 1 as a defensive
   * measure against content length drift. Block 4 MUST be `false`.
   */
  cache: boolean;
}

/**
 * Assembles the four-block supervisor prompt for a single LLM run.
 *
 * Block layout (Anthropic supports ≤ 4 cache breakpoints per request):
 *  1. Standing orders      [cache: true]  — docs/supervisor/STANDING_ORDERS.md
 *  2. Capability registry  [cache: true]  — capabilities.yml (re-read per run)
 *  3. Template library     [cache: true]  — docs/supervisor/plans/*.yml (all, lexicographic order)
 *  4. Current task         [cache: false] — incoming issue body + resolved slot values
 *
 * Callers MUST pass `promptCache: true` in `LLMOptions` when invoking `llmCall()`
 * so that the `cache_control` annotations on blocks 1–3 are honoured.
 *
 * @param blocks - Exactly four {@link CacheBlock} entries in the order above.
 * @returns Flat array of `LLMMessage` objects ready for `llmCall()`.
 * @throws {ValidationError} if `blocks.length !== 4`.
 * @throws {ValidationError} if more than 4 blocks have `cache: true`
 *   (Anthropic server-side limit).
 */
export function buildSupervisorPrompt(blocks: CacheBlock[]): LLMMessage[];
```

---

## Constraints and Invariants

1. **4 cache breakpoints maximum.** Anthropic enforces this server-side. If a future
   refactor adds a block, one existing block must be merged or dropped before the
   new block can carry `cache: true`.

2. **4,096-char minimum for auto-caching.** `buildAnthropicRequest()` auto-applies
   `cache_control` only when `sys.length >= 4096`. Always pass `promptCache: true`
   from `buildSupervisorPrompt()` to prevent regressions if block content shrinks.

3. **5-minute cache TTL.** Cache entries expire after 5 minutes of inactivity. At
   100+ calls/day blocks 1–3 will stay warm continuously.

4. **`capabilities.yml` is Red-tier.** The supervisor reads it per-run but must never
   modify it. Changes to the capability registry require a CODEOWNER-reviewed PR.

5. **Block 3 concatenation is lexicographic.** Templates must be joined in filename
   sort order so the cache key is deterministic across all Worker instances.

6. **Block 4 is never cached.** The issue body is untrusted data (STANDING_ORDERS.md
   Part D). Caching it would persist untrusted content in Anthropic's cache layer.

7. **`buildSupervisorPrompt()` is a pure function.** It must not perform I/O. File
   reads for blocks 1–3 happen in the calling context before `buildSupervisorPrompt()`
   is invoked; the assembled `LLMMessage[]` is passed to `llmCall()`.

---

## References

- `packages/llm/src/index.ts:165–194` — `buildAnthropicRequest()` with cache_control
- `docs/supervisor/STANDING_ORDERS.md` — Block 1 source (created in this PR)
- `capabilities.yml` — Block 2 source (not yet authored; size estimate used above)
- `docs/supervisor/plans/` — Block 3 source (9 templates, 24,182 chars as of 2026-05-05)
- Issue SUP-3.5 (#108) — consuming implementation (blocked until this ADR is merged)

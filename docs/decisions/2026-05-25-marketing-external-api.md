# ADR — Defer External Marketing API + Partner Self-Serve

**Status:** Accepted · **Date:** 2026-05-25 · **Decider:** @adrper79-dot · **Supersedes:** none · **Superseded by:** none

> **TL;DR:** The marketing supervisor canon ([`MARKETING_SUPERVISOR.md`](../marketing/MARKETING_SUPERVISOR.md)) is **internal-only**. A proposal to bake per-partner API keys + self-serve onboarding into the same Worker is **deferred** until after [PR 3e](../marketing/pr3-briefs/3e-supervisor-worker.md) ships and the internal loop is operating. Revisit as a post-3e capability with its own builder brief and ADR amendment.

---

## Context

While planning the marketing module, the operator framed the goal as *"a marketing module that makes the tools accessible internally and securely accessible externally."* That framing prompted a draft plan that proposed:

1. Per-partner API keys (issue/rotate/revoke, hashed-at-rest, scoped, rate-limited)
2. Self-serve partner onboarding flow (signup → magic-link verify via Resend → key mint → usage dashboard)
3. Public B2B partner portal stub at `/p/:partner_id` with signed URLs
4. A second `marketing_partners` / `marketing_api_keys` / `marketing_partner_sessions` / `portal_visits` schema co-tenanted with the supervisor

The proposal lived in a private plan file (`~/.claude/plans/eager-seeking-valley.md`) and never landed in the canon docs.

On closer reading, that scope **conflicts with the canon as written**:

- [`MARKETING_SUPERVISOR.md`](../marketing/MARKETING_SUPERVISOR.md) §2 defines the supervisor as a loop that "advances campaigns through their lifecycle" — no external API surface, no partner concept.
- [`CONSTITUTION.md`](../marketing/CONSTITUTION.md) does not enumerate partners as a first-class actor; the only externally-addressed agents are the channels (LinkedIn, YouTube, etc.) and the recipients (per ICP).
- [`ROADMAP.md`](../marketing/ROADMAP.md)'s 25-capability firepower list ends at #25 (`@latimer-woods-tech/topics`) — no slot is reserved for a partner-API package.
- [`pr3-briefs/3e-supervisor-worker.md`](../marketing/pr3-briefs/3e-supervisor-worker.md) registers a single `/control` endpoint behind admin auth; no per-partner authentication infrastructure is specified.

Building the external surface concurrently would also conflict operationally:

- It doubles the auth surface (admin JWT for operator + custom API-key middleware for partners) before the internal-only path has been validated.
- It introduces a `marketing_partners` table whose lifecycle (suspension, billing, ToS) is undesigned — anything we ship now would be thrown away when the real product question is answered.
- It adds external availability requirements to a Worker whose internal failure modes haven't been observed in production yet.

---

## Decision

### 1. Build the internal loop first per canon

[`apps/marketing-supervisor`](../../apps/marketing-supervisor/) (PR 3e, after the 3a → 3b → 3c bottleneck) is built **exactly as specified in MARKETING_SUPERVISOR.md** — 10 agents, 4 gates, 3 concurrent loops, internal-only `/control` endpoint behind admin JWT. **No partner table. No API keys. No self-serve.**

### 2. Defer the external API until two preconditions are met

The external partner API + self-serve is **deferred** until both:

| Precondition | Verified by |
|---|---|
| PR 3e ships and the supervisor has run autonomously for ≥30 days without a P1 incident | DigestComposer logs in `playbooks/digests/`; zero `escalation:loop-stuck` issues in the window |
| There is a named external partner (coach, agency, integration partner) with a written use case and a willingness to test in staging | A signed partnership letter, a Linear/GitHub Issue tracking the request, or an inbound contact captured in CRM |

Until both hold, partner access is delivered **manually**: the operator generates and hands off campaign artefacts directly.

### 3. When deferred work is revived, do it as new artefacts

When the external API is taken off the shelf:

- Add a new builder brief at `docs/marketing/pr3-briefs/3n-partner-api.md` (or higher letter, whichever is next free) that specs the partner-facing surface as a **separate** Worker (`apps/marketing-partner-api`) — not co-tenanted with `apps/marketing-supervisor`. The supervisor stays internal; the partner-api is a thin read-mostly proxy that calls supervisor endpoints with admin credentials it stores itself.
- Amend or supersede this ADR with the operating-model details (key format, scopes, rate-limit policy, sign-up flow).
- Update [`MARKETING_SUPERVISOR.md`](../marketing/MARKETING_SUPERVISOR.md) §6 ("Integration with the engineering supervisor") with a new "Integration with external partners" subsection.
- Add `marketing_partners` and `marketing_api_keys` as their own DB in their own Neon project; do not co-tenant with the supervisor's DB.

### 4. The lower-effort Pushover loop already exists as a near-substitute

[`apps/linkedin-publisher`](../../apps/linkedin-publisher/) (shipped via PR #978) demonstrates the single-channel cron→LLM→Pushover artefact pattern. If a near-term need surfaces for a *different* channel before PR 3e is ready, a sibling worker following that exact pattern is the right vehicle — not a generic partner API.

---

## Consequences

### Positive

- **Faster path to a working autonomous loop.** PR 3e is already the largest single PR in the bundle (5 days). Adding external surface scope risks slipping it.
- **Single auth model in v1.** Admin JWT only; no second auth path to debug, rate-limit, or instrument.
- **Reversible — by design.** Internal-only is a strict subset of internal-plus-external. Nothing in PR 3e blocks the future external layer; the partner-api just becomes an additional consumer of the same supervisor endpoints (with its own admin credential).
- **Forces clarity on partner demand.** Building partner-facing surfaces in anticipation of demand is a known anti-pattern. The "named external partner" precondition forces the system to surface concrete demand before building for it.

### Negative

- **No way for external partners to consume marketing artefacts via API today.** Workaround: operator manual handoff (Pushover digest → forward → publish).
- **The "marketing module is internal + externally accessible" framing is partially deferred.** The "internal" half ships per canon; the "externally accessible" half waits.
- **Future ADR debt.** The eventual partner-api ADR will need to revisit Neon isolation, billing hooks, ToS surface, key revocation flow — all easier to design well from clean slate than as a retrofit, but they do remain on the to-do list.

### Neutral

- No code is deleted or rolled back; this ADR only documents a decision **not** to build something that was never built.
- The plan file [`~/.claude/plans/eager-seeking-valley.md`](file:///C:/Users/Ultimate%20Warrior/.claude/plans/eager-seeking-valley.md) is now superseded by canon + this ADR; it should be regarded as historical context only.

---

## Alternatives considered

### Alt 1 — Bake external API into PR 3e

**Pros:** "Do it once," no future migration; partners can integrate from day one. **Cons:** Doubles the scope of the largest PR in the bundle; introduces a partner table whose lifecycle is undesigned; ships before any named partner demand exists. **Rejected** as premature optimization in the absence of demand.

### Alt 2 — Build the external API as PR 3e+1 (immediately after the supervisor)

**Pros:** Tight feedback loop between internal and external launches. **Cons:** Same as Alt 1 minus the within-PR-3e coupling; still ships a partner system without a partner. **Rejected** for the same reason but the timing is the right fallback if a named partner appears mid-flight.

### Alt 3 — Build only the partner-readable read-side (`GET /v1/runs/:id`), no writes

**Pros:** Half the surface, half the risk; lets a partner integration team browse artefacts without giving them the trigger primitive. **Cons:** Still introduces a `marketing_api_keys` table, still requires rate-limit infrastructure, still ships without demand. **Rejected** — the half-measure has most of the cost of the full measure.

### Alt 4 — Park the proposal entirely until post-Stage-2

**Pros:** Simplest. **Cons:** Loses the operator's intent (the "externally accessible" framing was deliberate). **Rejected** in favor of the explicit "two preconditions" gate above, which preserves the intent without committing to a date.

---

## References

- [`docs/marketing/MARKETING_SUPERVISOR.md`](../marketing/MARKETING_SUPERVISOR.md) — the canonical internal-only spec this ADR refuses to widen
- [`docs/marketing/pr3-briefs/3e-supervisor-worker.md`](../marketing/pr3-briefs/3e-supervisor-worker.md) — PR 3e brief, internal-only `/control` endpoint
- [`docs/marketing/CONSTITUTION.md`](../marketing/CONSTITUTION.md) — rules the autonomous system cannot break (does not enumerate partners)
- [`docs/marketing/ROADMAP.md`](../marketing/ROADMAP.md) — 25-capability firepower list (does not reserve a partner-API slot)
- [`apps/linkedin-publisher/`](../../apps/linkedin-publisher/) — shipped cron→LLM→Pushover pattern; the right vehicle if a single-channel need arises before PR 3e
- [`2026-05-18-attribution-model.md`](./2026-05-18-attribution-model.md) — peer ADR; same style + format

---

## Version history

| Date | Author | Change |
|------|--------|--------|
| 2026-05-25 | @adrper79-dot (drafted by Claude) | v1 — defer external marketing API + partner self-serve until post-3e with two named preconditions |

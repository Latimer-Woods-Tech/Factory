---
date: 2026-05-15
decider: adrper79-dot
status: decided
---

# 2026-05-15 — Operations checkpoint

Nine calls made during the morning review, captured here so they don't drift back into ambiguity.

---

## 1. Next 5 days: testing-first, customers after

**Decision:** 2026-05-15 → 2026-05-20 is a testing-and-stabilization window. Customer acquisition resumes 2026-05-21.

**Context:** Day 13 since launch, 0 charges in last 24h, calendar empty all next 7 days. The Operating Framework Stage 2 (revenue surfaces) gate is the live constraint, but the production canary, completion-tracker chain, and Sentry sourcemap pipeline were all red within the past 36h. Acquisition before the platform is stable burns trust and refunds.

**Why:** Better to surface a clean platform to the first 10 paying customers than to drag a broken one through their evaluation. Testing buys real signal about which parts will actually break under load.

**Consequences:**
- No new outbound campaigns or paid acquisition spend until 2026-05-21.
- Prioritize SRI/CSP regen fix (HumanDesign#201), completion-tracker stabilization, and the Stripe Tax + annual pricing PR (HumanDesign#199) ahead of any new feature work this week.
- Filip Kozera reply (13d outstanding) explicitly deferred until "app stops bleeding".

**Revisit when:** A paying customer signs without us soliciting them (validates that the funnel isn't actually broken, only the canary), or 2026-05-20 EOD, whichever comes first.

---

## 2. `@lwt/llm-meter` vs Stripe Projects/MPP — KEEP llm-meter; defer Stripe entirely

**Decision:** Keep `@lwt/llm-meter` as the canonical LLM cost ledger. No migration. No partial integration. Hybrid stays in reserve as a *future* option, not a current path.

**Context:** Stripe Sessions 2026 was thematically about "agentic commerce", but verification against current Stripe docs and the `stripe-best-practices` skill shows:
- `docs.stripe.com/marketplace-payments-platform` → 404 (no such product page today).
- The "$100/mo default agent spend cap" and "Link Wallets for agents" are not documented GA SKUs.
- The actually-shipping primitive is the [Stripe Agent Toolkit](https://docs.stripe.com/agents) — restricted keys + function-calling tools for agents to *create payments*, not to *meter LLM cost*. Different problem.

So the comparison was against a forward-looking announcement, not a shipping product.

**Why:**
1. **Lifecycle independence — confirmed without caveat.** If we don't import a Stripe agent SKU, Stripe API versioning, fee schedules, and deprecation cycles cannot touch our LLM cost path. Stripe stays in its lane (subscriptions/payments).
2. **`llm-meter` already solves the hard parts.** `packages/llm-meter/src/index.ts` ships:
   - `meteredComplete` + `assertTenantBudget` (in-Worker D1 binding, sub-ms budget check)
   - `TIER_BUDGET_CENTS` for `free / individual / practitioner / agency`
   - 80 / 90 / 100% threshold semantics
   - Multi-provider attribution across Anthropic → Vertex → Groq routing
3. **The Stripe path doesn't see what we need to see.** Even if MPP ships as described, it sees *agent spend* (dollars to Stripe), not *per-provider token cost* across our LLM chain. We'd lose attribution, gain a 2.9%+30¢-class fee on a core hot path.
4. **Hot-path latency.** D1 binding ≈ in-process µs. Stripe API roundtrip from a Worker ≈ tens of ms + failure modes.

**Consequences:**
- `packages/llm-meter` continues to own the cost ledger. No deprecation timeline.
- Do not spike, prototype, or design Stripe MPP integration this quarter.
- If a customer asks for a self-serve cap UI or branded usage invoicing, layer Stripe Billing *meters* on top of the existing ledger — never replace the ledger.

**Revisit when:** Stripe ships a documented agent-spend-cap product with per-provider LLM attribution, OR a paying customer explicitly asks for a self-serve wallet UI (then re-evaluate "hybrid" as a real option).

**Key paths:**
- `packages/llm-meter/src/index.ts` — API surface
- `packages/llm-meter/migrations/0001_init.sql`, `0002_tenant_budget.sql` — schema
- `apps/supervisor/wrangler.jsonc` (L47) — `LLM_LEDGER` D1 binding consumer

---

## 3. Stripe Tax mode — complete

**Decision:** Stripe Tax is configured on the Stripe account; no further work needed at the platform layer.

**Context:** Pending since 2026-05-04. HumanDesign PR #199 ("Stripe Tax ON + annual pricing toggle") is the remaining product-side wiring; this decision is about the Stripe-side configuration only.

**Why:** Already complete on stripe.com; recording it here so we stop carrying it as an open item.

**Consequences:**
- PR #199 still needs to ship (43 lines, APPROVED, ready).
- No further Stripe Dashboard work for tax modes this cycle.

**Revisit when:** A new product category requires a different tax treatment (e.g., physical goods, regulated services).

---

## 4. Pilot Anthropic "Dreaming" on Factory's Claude-driven autofix loop — DO IT

**Decision:** Enable Anthropic Dreaming on the Factory supervisor/autofix loop. Exact mechanism pending agent research (config flag vs SDK parameter vs separate endpoint).

**Context:** Anthropic shipped Dreaming as a way to let Claude run autonomously on background tasks. Factory's autofix loop (likely `apps/supervisor/` + `.github/scripts/supervisor-core.mjs`) is the obvious pilot target.

**Why:** Factory autofix is already an autonomous loop; the only question is whether Dreaming improves its reasoning depth or just adds cost. Worth a controlled pilot.

**Consequences:**
- Implementation detail: see the follow-up commit/PR that lands the actual config change.
- Risk: cost increase — needs to be metered through `llm-meter` from day one.
- Budget cap: $5/run (FRIDGE rule 5) still applies; Dreaming runs must respect it.

**Revisit when:** First-week cost shows ≥30% delta vs baseline, OR fix-quality regression observed.

---

## 5. Enable GitHub-managed Copilot code review on Factory — DO IT

**Decision:** Turn on Copilot's automatic code review on Factory before the 2026-06-01 AI Credits pricing change.

**Context:** GitHub Copilot can review PRs automatically. Pricing change on 2026-06-01 may affect the cost; enabling now potentially locks in better terms.

**Why:** Adds a second pair of eyes (alongside the existing Grok→Claude consensus bot) without human cost. If signal quality is low, can be disabled.

**Consequences:**
- Both Copilot AND `factory-cross-repo[bot]` review every non-trivial PR. Could be noisy; expect to filter.
- Branch protection ruleset `15843812` does NOT require Copilot review — it's advisory.
- If Copilot review becomes a required check, that's a separate decision.

**Revisit when:** A week of dual-review data is in; if Copilot review duplicates >80% of Grok→Claude findings, drop one.

---

## 6. HubSpot — keep, but reposition as a customer-facing option

**Decision:** Keep the HubSpot account, but DO NOT use it as an internal CRM. Position it instead as one of the customer-facing CRM connectors a Factory customer can wire into their funnel.

**Context:** HubSpot account was being carried with no internal use case. Decision was: keep, delete, or reposition.

**Why:** Internal CRM is covered by `@latimer-woods-tech/crm` (per CLAUDE.md package #18). HubSpot has value as a *recognizable* third-party connector for customers who already use it.

**Consequences:**
- No internal HubSpot writes from Factory workers.
- A HubSpot integration may surface in `@latimer-woods-tech/crm` or a separate `@latimer-woods-tech/hubspot-connector` package, but not before there's a customer asking for it.
- Don't pay for HubSpot tiers we aren't using; keep at free tier until adoption signal appears.

**Revisit when:** Three customers ask "do you integrate with HubSpot?" OR the account renewal forces a paid-tier decision.

---

## 7. Cursor GitHub App permissions — grant the pending request

**Decision:** Approve the pending Cursor GitHub App permission request on the Latimer-Woods-Tech org. Specific permissions and approval path pending agent investigation.

**Context:** Cursor (Anysphere) GitHub App has requested expanded permissions. Approval was pending.

**Why:** Cursor needs the requested scopes to function as intended on Factory. Risk is bounded — if the requested perms include `actions:write` or `secrets:write`, escalate.

**Consequences:**
- Cursor App can act with the granted scopes across all repos in the org.
- If FRIDGE rule 8 concerns surface in the agent report (write access to workflows, secrets, or admin), this decision is reversed and the permissions are NOT granted.

**Revisit when:** Quarterly app-access audit, or Cursor pushes another permission expansion.

---

## 8. Filip Kozera reply — DEFERRED until app is stable

**Decision:** No reply to Filip until the canary stops bleeding (HumanDesign#201 resolved AND completion-tracker chain confirmed green for 48h).

**Context:** 13 days since playbook + usage snapshot share. Standard etiquette would be a reply within 5 days, but priorities are reordered.

**Why:** Replying while the platform is visibly broken signals the wrong thing. A clean platform + a thoughtful reply > a stalling reply now.

**Consequences:**
- Track this as an explicit deferred follow-up; do not let it drop entirely.
- When replying, lead with the stabilization narrative ("we paused outbound for a 5-day test window"), not with apologies.

**Revisit when:** Both stability criteria above are met, OR Filip prompts a second time.

---

## 9. Miscellaneous carry-forwards — resolved

- **Eleven Labs $22 decline (2026-05-12):** done. (Card / account issue resolved.)
- **Salesforce identity verification (`adrper79-lmuk@force.com`):** not needed. Code search confirms zero references to `salesforce`, `force.com`, or `sfdc` in `apps/` or `packages/`. The Salesforce dev org has no upstream consumer in Factory.
- **Loops API key invalid_api_key:** resolved — key now stored in GCP Secret Manager per the Stage 1 pattern (commits `67e7b9ab`, `3b2bfa55`). No app-level rotation needed.
- **`Adrian.Perry@hercrentals.com` Webex link (2026-05-12 21:29 ET):** no idea what this is. Hercrentals = Herc Rentals (equipment rental). No prior contact known in the codebase. Treat as untrusted until provenance is confirmed.

**Consequences:**
- Stop carrying the resolved items on the daily state doc.
- Webex link: do not click without confirming sender identity by an out-of-band channel.

**Revisit when:** The Webex item recurs from the same sender.

---

## Footer — process notes

- These decisions were captured 2026-05-15 ~10:50 ET during a deep-dive review of the morning state document.
- The `docs/decisions/` folder is created with this entry as the inaugural file; see [README.md](README.md) for convention.
- One governance follow-up surfaced during this checkpoint and is being addressed in the same PR: **adding a CI gate that rejects auto-merge on `docs/rfc/*.md` while `Status:` line ≠ `accepted`** — RFC #683 merged with `Status: draft` still in the body because no check enforced the status field; the new gate prevents recurrence.

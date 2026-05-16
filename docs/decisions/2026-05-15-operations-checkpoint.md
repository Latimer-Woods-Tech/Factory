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

## 4. Pilot Anthropic "Dreaming" on Factory autofix loop — INTENT CONFIRMED; first step is an RFC, not a config flag

**Decision:** Adopt Dreaming for the supervisor/autofix loop, but the path is heavier than a toggle. First action: open an RFC titled "Pilot Anthropic Dreaming via Claude Managed Agents migration for supervisor autofix" and request research-preview access from Anthropic. No code change until research-preview access is granted.

**Context:** "Do it" was given on the assumption Dreaming is a config flag. Verification: Dreaming is a scheduled inter-session memory-consolidation process (replays past sessions, extracts patterns, writes new memory entries — modeled on hippocampal consolidation). It is **exclusive to Claude Managed Agents** (Anthropic's hosted agents research preview), NOT a parameter on the raw `/v1/messages` API that Factory's autofix uses today (`supervisor-core.mjs`, `pr-review.mjs`).

**Why:** Migrating the autofix loop from raw fetch → Claude Managed Agents SDK is a real port, not a tweak. The right governance path is the same one every other multi-week change uses: RFC → research-preview gate → design → implementation.

**Consequences:**
- An RFC gets filed (target: this week, while research-preview access is being requested).
- Until research-preview is granted, no code change. Don't speculatively scaffold against an SDK we can't call.
- The cost-metering concern (`llm-meter` ledger, $5/run FRIDGE rule 5 cap) carries into the RFC as a non-negotiable.

**Revisit when:** Research-preview access lands from Anthropic OR Anthropic ships Dreaming as a parameter on the standard API.

Sources for the verification:
- [Anthropic introduces "dreaming" — VentureBeat](https://venturebeat.com/technology/anthropic-introduces-dreaming-a-system-that-lets-ai-agents-learn-from-their-own-mistakes)
- [Anthropic Managed Agents dreaming outcomes — The New Stack](https://thenewstack.io/anthropic-managed-agents-dreaming-outcomes/)

---

## 5. Enable GitHub-managed Copilot code review on Factory — DO IT (UI-only, 60 seconds)

**Decision:** Turn on Copilot's automatic code review on Factory before the 2026-06-01 AI Credits pricing change. Configuration is via a **branch ruleset**, UI-only — no REST API exists for this toggle.

**Context:** Factory is private; after 2026-06-01 each Copilot review consumes GitHub Actions minutes. Enabling now sets the policy before the meter starts.

**Why:** Adds a second pair of eyes (alongside the existing Grok→Claude consensus bot) without human cost. If signal quality is low, can be disabled.

**Click path (the actual procedure since there's no API):**
1. `https://github.com/Latimer-Woods-Tech/Factory` → Settings
2. Rules → Rulesets → New ruleset → New branch ruleset
3. Name: `copilot-auto-review`; Enforcement Status: **Active**
4. Target branches → Include default branch (`main`)
5. Check **"Automatically request Copilot code review"**
6. Create

**Consequences:**
- Both Copilot AND `factory-cross-repo[bot]` review every non-trivial PR. Could be noisy; expect to filter.
- After 2026-06-01: Actions minutes spend goes up; track via existing cost-digest workflow.
- Branch protection ruleset `15843812` does NOT require Copilot review — it's advisory.

**Revisit when:** A week of dual-review data is in; if Copilot duplicates >80% of Grok→Claude findings, drop one.

Source: [Configuring automatic code review by GitHub Copilot — GitHub Docs](https://docs.github.com/en/copilot/how-tos/copilot-on-github/set-up-copilot/configure-automatic-review), [Copilot review Actions-minute change 2026-06-01](https://github.blog/changelog/2026-04-27-github-copilot-code-review-will-start-consuming-github-actions-minutes-on-june-1-2026/)

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

## 7. Cursor GitHub App permissions — INTENT CONFIRMED; UI-only, with hard refusals on specific scopes

**Decision:** Approve the pending Cursor request, but only after confirming the requested scopes don't include the three FRIDGE-disallowed write surfaces (`secrets:*`, `workflows:write`, `administration:*`). Refuse those and accept the minimum-viable set.

**Context:** Verification: **Cursor is not currently installed on the Latimer-Woods-Tech org** (only `factory-cross-repo` is, id `128523115`). The pending prompt the user saw is therefore either (a) on a personal install under `adrper79-dot` (user-scope, not org-scope) or (b) a fresh org install request waiting at the org-settings installation page. GitHub does not expose a REST endpoint for approving pending app installs or permission requests — `gh` CLI / MCP cannot do this; UI is the only path.

**Click path:**
1. `https://github.com/organizations/Latimer-Woods-Tech/settings/installations`
2. Open the **Pending requests** tab (or **Installed GitHub Apps** if Cursor partially installed)
3. Click Cursor → **Review request**
4. Grant per-permission, applying the rules below

**Permission policy (FRIDGE rule 8 derived):**
- ✅ Acceptable: `contents:write`, `pull_requests:write`, `issues:write`, `metadata:read` — on selected repos only, not the whole org.
- ❌ Refuse: `secrets:*` (Factory secrets live in GCP Secret Manager + GH repo secrets; no third-party app reads them).
- ❌ Refuse: `workflows:write` (the supervisor autofix loop owns workflow files; a third-party write here is supply-chain risk).
- ❌ Refuse: `administration:*` at org level (only `factory-cross-repo` should hold that).

**If Cursor refuses to install without one of the refused scopes:** don't install. Use Cursor with its non-GitHub features only; revisit when they offer a granular scope.

**Consequences:**
- Cursor App can act with the granted scopes on the repos you select — not org-wide unless that's a Cursor install constraint.
- Screenshot the granted permission set and attach to this decision file (or a comment on the audit issue) for the quarterly review.

**Revisit when:** Quarterly app-access audit, OR Cursor pushes another permission expansion (will fire a fresh request).

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

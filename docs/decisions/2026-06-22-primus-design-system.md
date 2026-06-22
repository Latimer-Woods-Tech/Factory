---
date: 2026-06-22
decider: "@adrper79-dot"
status: decided
---

# 2026-06-22 — Primus design system & primusui.com as Stage 6 home

> Scope note: this ADR fixes the *decisions of record* (what Primus is, naming, the framework-agnostic-tokens rule, and that `primusui.com` is its home). The full concept, architecture, and delivery path live in [`docs/architecture/PRIMUS.md`](../architecture/PRIMUS.md) — that document is authoritative for scope; this ADR does not maintain a parallel backlog.

## Decision

**Stage 6 (UI/UX Foundations) is delivered as "Primus" — the consolidation of the existing fragmented design packages into one layered system whose single source of truth is `@latimer-woods-tech/design-tokens`, and whose public, living home is [primusui.com](https://primusui.com).** The `primusui.com` domain is repurposed from a previously-considered web3 hub to the design-system showcase.

## Context

`primusui.com` (owned, on Cloudflare) was being considered for a web3 capabilities hub. An assessment against the roadmap found no web3 anywhere in the portfolio and an org explicitly in a consolidation stage — web3 was off-roadmap. The domain name ("Primus UI") and Stage 6 ("UI/UX Foundations", already on the roadmap as M11–M15) are a natural fit instead. Stage 6 had already sprouted incoherently: `design-tokens` (v0.2) and `design-system` (v0.1) define competing token sets; `packages/ui` (v0.2) exists but is imported by no app; three apps use three CSS strategies and three primary colors. The diagnosed root cause of the orphaning is that the system had no visible home.

## Why

The domain matches the work, the work is already on the roadmap, and a visible front door is the missing piece that makes a shared system actually get adopted. Web3 was off-roadmap and added regulatory/tech surface to a portfolio at <5% completion; this re-points the same asset at a roadmap accelerator instead.

## Decisions of record

1. **Web3 hub is not pursued.** `primusui.com` becomes the Primus showcase. (A narrow future option — USDC creator payouts for Capricast once it has real GMV — is deferred to `docs/GAP_REGISTER.md`, not built.)
2. **Single source of truth for tokens = `@latimer-woods-tech/design-tokens`.** The duplicate token definitions in `packages/design-system` are removed; `design-system` re-exports from `design-tokens` only.
3. **Tokens are framework-agnostic, compiled to three outputs** — CSS custom properties, a TS export, and a Tailwind preset — because the portfolio has no single rendering model (Workers HTML strings, React, Next, plain HTML, separate repos).
4. **Naming: keep the existing published package names** (`design-tokens`, `design-system`, `ui`). The roadmap milestone labels (`ui-tokens`, etc.) are aliases, not new packages — no rename churn.
5. **`primusui.com` is a first-class deliverable, shipped early** (Phase B) with the existing Storybook, not documentation that trails the code.
6. **Adoption enforcement stays shadow until proven on one app** (the Stage 4 enforcement rule applies to the new 11th conformance dimension).
7. **Token source format = W3C DTCG JSON compiled by Style Dictionary** (not a hand-written TS file emitting formats). The standard format future-proofs new platforms and removes drift between the three outputs.
8. **Code-first; Figma sync is out of scope.** The portfolio uses no Figma and has no designer, so there is no design tool to round-trip with. Revisit only if a Figma-based design workflow is adopted.
9. **Cross-repo release discipline from v1 = Changesets + strict semver + a written deprecation policy.** Because `selfprime`/`capricast` consume the packages from separate repos, version skew is the primary failure mode; this is the one process investment that is expensive to retrofit.

## Consequences

We now do:
- Treat `docs/architecture/PRIMUS.md` as the authoritative scope/architecture/delivery document for Stage 6.
- Run the delivery path A→E in PRIMUS.md §6: unify tokens → stand up primusui.com → complete components + a11y/forms/icons → first adopter (admin-studio-ui) → roll to xico-city/coh + shadow conformance gate.
- Append the UI packages (`design-tokens`, `design-system`, `ui`, and the planned `a11y`/`forms`/`icons`) to the `CLAUDE.md` package dependency-order list, which currently omits them.

We do NOT:
- Force a single frontend framework. `latwoodtech-web`'s bespoke Tier-2 look consumes tokens only and is not rewritten.
- Block Stage 6 on the separate `selfprime` / `capricast` repos; they adopt via published npm packages on their own timeline.
- Build the web3 hub.

## Revisit when

- An adopter proves the system end-to-end and the 11th conformance dimension is ready to flip from shadow to required (promote enforcement details to a full RFC at that point), OR
- Capricast reaches real payout GMV and the deferred USDC-payouts capability is reconsidered, OR
- A Figma-based design workflow is adopted (reopens decision 8: add DTCG round-trip via Tokens Studio).

# Primus — the Latimer Woods Design System

> **Status:** Stage 6 (UI/UX Foundations) definition. Consolidates existing, fragmented design packages into one coherent system with a public home at **[primusui.com](https://primusui.com)**.
>
> **Decision of record:** [`docs/decisions/2026-06-22-primus-design-system.md`](../decisions/2026-06-22-primus-design-system.md).
> **Step-by-step execution:** [`docs/architecture/PRIMUS_IMPLEMENTATION_PLAN.md`](./PRIMUS_IMPLEMENTATION_PLAN.md) (Phase A + B, agent-executable).
> **Roadmap line:** [`docs/ROADMAP.md`](../ROADMAP.md) Stage 6 — M11–M15.
> **Reuse tiers:** [`docs/DESIGN_SYSTEM_SCOPE.md`](../DESIGN_SYSTEM_SCOPE.md). **Frontend standards:** [`docs/FACTORY_FRONTEND_STANDARDS.md`](../FACTORY_FRONTEND_STANDARDS.md).

## 1. What Primus is

**Primus is the shared visual language for every Latimer Woods product — tokens → CSS → components → a11y/forms/icons — and `primusui.com` is its living home** (showcase, documentation, and token reference). The domain is not a product; it is the front door that makes the design system discoverable, so it stops being orphaned.

One sentence per layer:

- **Tokens** define the brand (color, type, space, motion) as data, in one place.
- **CSS base** applies those tokens to any HTML, with no framework required.
- **Components** package the Tier-1 primitives (Button, Input, Modal, Toast…) for the React apps.
- **a11y / forms / icons** cover the specialized surfaces.
- **primusui.com** shows all of it, live, to humans and to AI agents building against it.

## 2. Why this exists (the problem of record)

Stage 6 already sprouted — incoherently. As of 2026-06-22 the repo contains:

| Artifact | State |
|---|---|
| `packages/design-tokens` (v0.2) | ✅ WCAG-AA colors, 4px base spacing (steps 8/16/24/32), typography, motion |
| `packages/design-system` (v0.1) | ⚠️ **Duplicates** tokens with *different* naming — a second source of truth |
| `packages/ui` (v0.2) | ⚠️ Real components (Button, Card, Dialog, Input, Toast…) but **orphaned: no app imports it** |
| `packages/admin-studio-ui` | ✅ React + Vite + **Storybook** (port 6006) + Radix + Tailwind + CVA, with real stories |
| `a11y`, `forms`, `icons` | ❌ Not created |

Meanwhile the apps are **~8/10 fragmented**: three CSS strategies (Tailwind ×2, ~3,700 lines of bespoke CSS in `latwoodtech-web`), three unrelated primary colors (teal / gold / blue), and token files that disagree with each other.

**The root cause of the orphaning is invisibility.** A design system nobody can see does not get adopted. Primus therefore treats *the showcase* (`primusui.com`) as a first-class deliverable, not documentation that trails the code.

**So Stage 6 is not "build a design system." It is: consolidate the duplicates, de-orphan what exists, fill three gaps, give it a home, and drive adoption.**

## 3. The constraint that shapes the architecture

**There is no single rendering model across the portfolio:**

- Workers serve JSON / HTML strings (Hono).
- `admin-studio-ui` is React + Vite; `qa-tools-ui` is Next.js.
- `latwoodtech-web` is plain HTML/CSS.
- `selfprime` and `capricast` live in **separate repos**.

A React-only design system would re-orphan itself for half the portfolio. Therefore **the token layer must be framework-agnostic**, and tokens are the single source compiled to *three* outputs.

## 4. Architecture — the layered model

| Layer | Package | Emits | Consumable by |
|---|---|---|---|
| **L0 Tokens** (single source) | `@latimer-woods-tech/design-tokens` | CSS custom properties **+** TS export **+** Tailwind preset | *Everything* — HTML, Worker HTML strings, React, Next, Tailwind |
| **L1 Base CSS** | `design-tokens/base.css` | reset + primitives (focus rings, dark default) | Plain HTML, Worker-rendered pages, `latwoodtech-web` |
| **L2 Components** | `@latimer-woods-tech/ui` | React components (Radix + CVA) | The SPA apps |
| **L3 Specialized** | `@latimer-woods-tech/a11y`, `…/forms`, `…/icons` | hooks + validated form primitives + icon set | SPA apps + forms anywhere |
| **L4 Showcase** | **`primusui.com`** | Storybook + docs + live token reference on CF Pages | Humans + AI agents (reference) |

**The load-bearing rule:** tokens compile from one source to CSS variables, a TS object, and a Tailwind config. Change the brand once → all three update. That single rule kills the "three color systems" problem and serves every consumer regardless of framework.

### 4.1 Token source format — code-first, DTCG + Style Dictionary

The portfolio uses **no Figma and has no designer** (confirmed 2026-06-22). Primus is therefore **code-first**: there is no design tool to round-trip with, so Figma sync is explicitly **out of scope** (it would be ceremony with no payoff).

Best practice for the source, even code-first, is a **standard, tool-agnostic token format compiled by a transform tool** — not a hand-written TS file emitting three formats by hand. Primus adopts:

- **Source of truth:** [W3C DTCG](https://design-tokens.github.io/community-group/format/) JSON token files in `packages/design-tokens/tokens/`.
- **Build:** [Style Dictionary](https://styledictionary.com/) transforms the DTCG source → the three outputs (CSS custom properties, TS export, Tailwind preset). `design-tokens` ships the build, not hand-authored format files.
- **Rationale:** DTCG is the emerging standard; it future-proofs new platforms (PDF/film/email) and a *future* Figma adoption without rewriting the source, and removes the risk of the three hand-emitted formats drifting.

The existing hand-written `src/index.ts` tokens are the seed values; Phase A migrates them into DTCG JSON, it does not start from zero.

### 4.2 Release discipline — semver + Changesets (cross-repo is the reason)

Because `selfprime` and `capricast` consume Primus as **published npm packages from separate repos**, version skew is the primary failure mode. Primus requires real release discipline from the first published version:

- **[Changesets](https://github.com/changesets/changesets)** for versioning + automated changelogs; every package change ships a changeset.
- **Strict semver**, with a written **deprecation policy** (a removed/renamed token or component is deprecated for one minor before removal).
- **No silent breaking changes** to tokens or component APIs consumed cross-repo.

This is deliberately heavier than the current git-tag publish flow — it is the one process investment that is expensive to retrofit once external repos depend on the packages.

## 5. What fits — and what is deliberately out of scope

**In scope (do it):**

- Token consolidation → one source, three outputs (kills the `design-system`/`design-tokens` duplication).
- Framework-agnostic CSS base (so Worker-rendered HTML and the separate repos adopt cheaply).
- The orphaned `ui` library, completed and actually imported by an app.
- `a11y` / `forms` / `icons` gaps filled.
- `primusui.com` as Storybook + docs + live token reference.

**Out of scope (protect these):**

- ❌ **Forcing one framework.** `latwoodtech-web`'s bespoke art-directed look (Cormorant / Space Grotesk, gold palette) is **Tier 2 app-specific** per `DESIGN_SYSTEM_SCOPE.md` — it consumes *tokens*, not components. Do not rewrite it.
- ❌ **Blocking on the separate repos** (`selfprime`, `capricast`). They adopt via published npm packages on their own timeline; primusui.com is how they discover the system.
- ❌ **Hard-gating adoption before the system is proven on one app.** The 11th conformance dimension stays **shadow** until an adopter validates it (matches Stage 4 enforcement discipline).
- ❌ **Figma / design-tool sync.** No Figma in the workflow (§4.1) → no round-trip tooling.

**Deferred until adoption justifies them (building now would be over-engineering):**

- **Visual-regression testing** (Chromatic or Playwright snapshots) — add post-Phase-D, once components actually churn and there are adopters to protect.
- **A standalone showcase app.** Phase B intentionally reuses `admin-studio-ui`'s Storybook on primusui.com. Split it into a dedicated design-system showcase only once a second framework's components need showing — not before.

**Two cleanups settled up front:**

1. **Naming.** The roadmap says `ui-tokens`; the package is `design-tokens`. Primus standardizes on the **existing published names** (`design-tokens`, `design-system`, `ui`) to avoid a rename churn; the roadmap milestone labels are aliases, not new packages. See the ADR.
2. **Dependency order.** None of these UI packages appear in the `CLAUDE.md` dependency-order list (1–26). They are appended there as part of Phase A.

## 6. Delivery path

Phased so something visible ships in **Phase B**, and each phase has a concrete done-signal in the house "curl-with-your-own-eyes" style.

- **Phase A — Unify tokens (M11).** Migrate the hand-written tokens into **DTCG JSON** as the single source; wire **Style Dictionary** to emit CSS vars + TS + Tailwind preset (§4.1). Collapse the `design-system` duplicate to a re-export of `design-tokens`. Stand up **Changesets** + a semver/deprecation policy (§4.2) before any external repo consumes the packages. Append the UI packages to the `CLAUDE.md` dependency order.
  *Done = `admin-studio-ui` and one Worker-rendered page consume the same `--color-*` vars built from the DTCG source; visual diff shows identical primary; a changeset-driven release publishes a versioned package.*
- **Phase B — Stand up `primusui.com` (the front door).** Deploy the *existing* admin-studio-ui Storybook + a token-reference page to Cloudflare Pages on the domain. Ships value with what already exists.
  *Done = `curl -I https://primusui.com/` → 200; Storybook renders Button/Card.*
- **Phase C — Complete the system (M12–M14).** De-orphan `ui`; build `a11y` (focus/keyboard/contrast hooks), `forms` (validated primitives), `icons`. Each lands as a Storybook story on primusui.com.
  *Done = every Tier-1 component (Button, Input, Modal, Toast, Nav, Form) has a live story + is axe-clean.*
- **Phase D — First real adopter.** Wire `factory-admin-studio` (admin-studio-ui) to consume tokens + `ui` end-to-end. This is the proof.
  *Done = admin-studio-ui imports zero local button/card; Lighthouse a11y ≥95 on its main route.*
- **Phase E — Roll + enforce (M15).** `xico-city` and `coh` adopt the CSS base layer. Add the **11th conformance dimension** + axe / Lighthouse budgets as **shadow**; flip to required only for repos already ≥80 (the Stage 4 rule).
  *Done = the conformance summary shows a "design-system adoption" score per repo.*

## 7. Quality targets (from PLATFORM_STANDARDS §13)

- **Accessibility:** WCAG 2.2 AA, zero violations on critical paths, full keyboard navigation, ≥4.5:1 contrast.
- **Performance (Lighthouse):** Marketing pages ≥95 all categories; app pages Performance ≥85 / Accessibility ≥95 / Best Practices ≥90.
- **Core Web Vitals:** LCP <1s desktop / <2.5s mobile; INP <200ms; CLS <0.1; JS <150KB gzipped per route.
- **Design philosophy (PLATFORM_STANDARDS §13):** every decision passes two filters — *"What would Steve Jobs do?"* (focus, simplicity, performance IS design) and *"What does the 2026 market want / not want?"* (dark default, skeleton states, no popups, no chatbot ambushes, native mobile).

## 8. Exit criteria (Stage 6, restated)

Three currently UI-less apps (`cypher-healing`, `xico-city`, `factory-admin-studio`) **inherit a coherent visual language by default**, WCAG 2.2 AA and Lighthouse budgets are **enforced** (shadow → required per Stage 4 rule), and `primusui.com` is the live, canonical reference for the system.

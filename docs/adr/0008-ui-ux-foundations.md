# ADR-0008: UI/UX Foundations — Stage 6 of the Cohesion Roadmap

- **Status:** Accepted
- **Date:** 2026-05-11
- **Deciders:** @adrper79-dot
- **Tags:** governance, ui-ux, design-system, sellability

## Context

PLATFORM_STANDARDS has 10 dimensions. None are UI-specific. PACKAGE_MATRIX has 22 packages. **Zero are UI infrastructure.** Each repo handles components, forms, design tokens, accessibility, and icons independently — when they handle them at all.

State of the 5 apps as of 2026-05-11:
- **HumanDesign (selfprime.net)** — mature Next.js, custom components, i18n, axe in CI. Most polished.
- **videoking (capricast.com)** — Next.js App Router, custom components, no design system, no a11y enforcement.
- **factory-admin-studio** — minimal admin UI, API-driven, no operator experience design.
- **cypher-healing (cypherofhealing.com)** — multi-tenant API only today, **no UI**.
- **xico-city** — scaffolding stage, no shipped UI.

**Three of five apps need UI built from scratch.** The April 28 T4.1 doc flagged "T4.2 Front-End Standards" as scheduled for May 5–8. That work never happened. Building three new UIs without a design system means three independent visual languages, three sets of duplicated form code, three a11y reckonings later.

Stage 5 (sellability) requires WCAG 2.2 AA on customer-facing UI. Without a design system, Stage 5 becomes per-app rework forever.

## Decision

Add **Stage 6 — UI/UX Foundations** to the cohesion roadmap (per OPERATING_FRAMEWORK §6-stage sequence). Target ship: **2026-05-22**, parallel with Stages 3–5.

Stage 6 has five milestones (M11–M15):

- **M11** `@latimer-woods-tech/ui-tokens` — design tokens (color, type, spacing, motion, breakpoints, z-index). Dark-mode-first; light is a variant. Tailwind preset + CSS variables + JSON for non-Tailwind consumers.
- **M12** `@latimer-woods-tech/design-system` — 12 core React components: Button, Input, Select, Textarea, Modal, Toast, Card, Layout (App Shell), Nav, Form, Table, Spinner (skeleton-by-default), Tabs. Radix primitives under the hood. Storybook for visual review.
- **M13** `@latimer-woods-tech/a11y` + `@latimer-woods-tech/forms` — focus traps, keyboard nav, ARIA helpers, form schemas + validation + inline error UX.
- **M14** `@latimer-woods-tech/icons` — Lucide-based icon set, tree-shakeable, dark-mode aware.
- **M15** PLATFORM_STANDARDS §12 (UI/UX) + 11th conformance dimension in `platform-conformance.yml`.

Adoption targets (in order of urgency):
1. **cypher-healing** — has no UI; build greenfield with the design system. Highest leverage.
2. **xico-city** — scaffolding stage; design system available before non-trivial pages ship.
3. **factory-admin-studio** — operator experience deserves design work; admin UIs that suck slow you down daily.
4. videoking — refactor existing components onto the system in Stage 7 (post-roadmap).
5. HumanDesign — defer until v2.

**Design philosophy is law** (encoded in §12 below): *Steve Jobs filter* (focus, simplicity, performance IS design) + *2026 market do/don't list* (dark mode default, skeleton states, no popups, no chatbot ambushes, native mobile feel).

## Alternatives considered

1. **No design system. Each app handles UI per-repo.** Rejected: current state. Produces drift, duplicated work, accessibility debt at every Stage 5 audit.

2. **Adopt an off-the-shelf design system (shadcn/ui, Material UI, Chakra).** Considered. Rejected as primary: brand differentiation is hard when you ship Material out of the box, and shadcn/ui is excellent as a foundation but is not a versioned + governed system suitable for the cohesion model. **Decision: build on top of Radix primitives + shadcn/ui patterns + Tailwind, but publish as our own versioned `@lwt/design-system`.** Reuses the proven primitives, owns the versioning + theming + governance.

3. **Hire a designer first, system second.** Rejected: timeline pressure (June 1 GitHub Copilot billing change + the user's stated "all complete by May 25" target). Functional system now, visual refinement when revenue justifies hiring design.

4. **Skip UI for cypher-healing and xico-city; admin-studio gets a quick admin theme.** Rejected: cypher-healing has no path to revenue without customer-facing UI; xico-city's product narrative (DJMEXXICO artist platform) explicitly requires customer UX.

## Consequences

- **Positive:**
  - cypher-healing + xico-city + factory-admin-studio inherit a coherent visual language by default
  - WCAG 2.2 AA enforced from day 1 in three new apps; Stage 5 a11y audit becomes a pass-through, not a remediation project
  - Lighthouse perf budgets enforced from day 1 (≥95 marketing, ≥85 app)
  - Form schemas + inline error UX standardized — biggest UX cost-driver per new feature
  - HumanDesign + videoking get a migration path; not forced to migrate today, but the gravity well is there
  - Future apps onboard in days, not weeks

- **Negative:**
  - +1 week of platform work concurrent with Stages 3–5 (May 16–22)
  - 4 new packages to maintain (ui-tokens, design-system, a11y, forms, icons — actually 5 if forms is its own)
  - Without a human designer, the visual style is "Radix defaults + Tailwind tokens + good taste from system prompts" — functional, not award-winning. Acceptable until revenue justifies hiring design.
  - Storybook adds ~5MB to repo size; CI cost negligible

- **Neutral:**
  - Compatible with ADR-0001 (cohesion architecture); the UI/UX layer is a new lane in the three lines of defense
  - Compatible with ADR-0003 (Claude reviewer) and ADR-0006 (cascade) — reviews apply to UI PRs the same as backend
  - Storybook lives in each package's directory; no separate hosting cost

## Rollback

Three rollback levels:

1. **Unpublish packages**, revert per-app adoption. Apps return to per-repo UI handling. ~30 min.
2. **Demote §12 standards** from conformance dimensions to advisory. Existing UI keeps shipping, no enforcement.
3. **Cancel Stage 6** entirely, mark superseded in a follow-up ADR. Frees ~1 week of platform work.

Triggers for rollback:
- 3+ apps reject the design system within 30 days of availability (signal: it's not actually useful)
- a11y conformance dimension fails > 50% of customer-facing PRs in shadow mode (signal: standards too strict for current code state — needs phase-in plan)
- Lighthouse perf budget blocks > 20% of legitimate PRs (signal: budget too aggressive)

## Implementation

- [ ] **M11** `@lwt/ui-tokens` — sub-agent (in flight)
- [ ] **M12** `@lwt/design-system` — sub-agent (in flight, paired with M11)
- [ ] **M13** `@lwt/a11y` + `@lwt/forms` — sub-agent (next batch)
- [ ] **M14** `@lwt/icons` — sub-agent (next batch)
- [ ] **M15** PLATFORM_STANDARDS §12 + platform-conformance.yml 11th dimension — added in this PR (preview); enforced after Stage 1 conformance workflow ships
- [ ] Adoption order: cypher-healing → xico-city → factory-admin-studio (Stage 7 work)
- [ ] Storybook published per package (HTML artifact in CI, viewable by reviewers)

## The Two-Question Filter (PLATFORM_STANDARDS §13 — new section)

Every UI design decision passes through both filters:

### Filter 1: "What would Steve Jobs do?"

Machine-checkable rules:
- **One primary action per screen.** Two buttons of equal weight = failure. Either change hierarchy or remove one.
- **Type and whitespace carry the brand.** No decorative borders, no excessive icons, no chrome for chrome's sake.
- **Performance IS design.** Sub-1s LCP, sub-200ms interaction. Spinners are not allowed — use skeleton screens or optimistic UI.
- **4px grid for everything.** All spacing, all sizing.
- **One weight scale.** 100/200/300/400/500/600/700/800.
- **Animation < 200ms.** Or it's not animation, it's friction.
- **Mobile is the default; desktop is the variant.** Design 320px first.
- **Dark mode is the default; light is the variant.** Both ship at the same time, exact parity.

Subjective rules (PR review):
- Delete a feature before adding a feature.
- Details matter — the 1px alignment, the easing curve, the placeholder text. Sweat it.
- People don't know what they want until you show it. Don't ship by survey.

### Filter 2: "What do people in the market want and not want?" (2026)

Wants — affirmatively design for:
- Fast (sub-1s LCP, sub-200ms response)
- Dark mode as default
- Keyboard shortcuts (`Cmd+K` palette on every app)
- Real-time updates (no manual refresh)
- Offline-capable where the data shape allows
- Privacy visible (clear data export + delete, no dark patterns)
- Native-feeling mobile (no jank, no rubber-banding, no fake clicks)
- AI-assisted but not pushy (no chatbot ambush; assist on focus, not on page load)
- One-column forms with big tap targets, autofocus, autosave
- Skeleton loading states everywhere
- Inline errors, specific + actionable
- Empty states that say "do this next"

Don't wants — explicitly forbidden:
- Cookie banners that aren't legally required (and minimize when they are)
- Newsletter modals
- Chatbot ambushes (no auto-open)
- Blocking onboarding tours (let the user explore; show hints contextually)
- Sticky bottom CTAs on customer-facing pages
- Forced sign-up walls for content discovery
- Auto-playing video with sound (ever)
- Hamburger menus on desktop (use a real nav)
- Carousels (proven to underperform; use multi-row layouts)
- Animation for animation's sake (every animation has a job)
- 10-step forms (decompose into context-driven flows)
- Loading spinners (skeleton screens or optimistic UI only)
- Forced password reset emails for marketing reasons
- "Are you sure?" dialogs for non-destructive actions

## Links

- ADR-0001: Cohesion Architecture (Stage 6 fits the three-lines-of-defense model)
- ADR-0002: Operating Framework (2-week milestone box for Stage 6)
- ADR-0005: PR size budget (Storybook + components are size-budgeted normally)
- `docs/PLATFORM_STANDARDS.md` §12 (UI/UX dimensions added by this PR)
- `docs/PLATFORM_STANDARDS.md` §13 (Two-Question Filter encoded by this PR)
- `docs/ROADMAP.md` (Stage 6 added by this PR)
- `docs/PACKAGE_MATRIX.md` (M11–M14 packages added)
- `docs/GAP_REGISTER.md` (closes G16-design-system, G17-a11y-parity, others)

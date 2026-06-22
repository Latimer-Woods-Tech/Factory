# Primus — Implementation Plan (Phase A + B)

> **For the implementing agent (Sonnet):** This is a step-by-step execution plan. The *why* lives in [`PRIMUS.md`](./PRIMUS.md) and the [ADR](../decisions/2026-06-22-primus-design-system.md) — read both once before starting, then follow this plan literally. Do **not** redesign; if reality contradicts a step, STOP and report (see Guardrails §0.4).
>
> **Scope of this document:** Phase A (token unification + foundations) and Phase B (primusui.com showcase) in full detail. Phases C–E are outlined only — return for a detailed plan before starting Phase C.

---

## 0. Guardrails — read before any edit

### 0.1 Branch & PR
- Work on a new branch off `main`: `git checkout main && git pull && git checkout -b feat/primus-stage6-phase-a`.
- Do **not** work on `chore/admin-studio-test-coverage` or any unrelated branch.
- One PR per phase. Phase A = one PR; Phase B = a second PR.
- If `PRIMUS.md` and the ADR are not yet on `main`, include them in the Phase A PR (they are the authority for this work).

### 0.2 Commit format (enforced)
`<type>(<scope>): <description>` — scope is the package name without the `@latimer-woods-tech/` prefix. End every commit message with:
`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

### 0.3 Hard constraints that apply here
- **Style Dictionary is a build-time tool only** (a `devDependency`). It runs in Node during `npm run build` and emits static CSS/TS. Its output (CSS custom properties, plain TS constants) ships to the browser/Workers; the tool itself never runs at runtime. This does **not** violate the "no Node built-ins in Workers" rule.
- These are **npm packages built with `tsup`**, not Workers — normal Node devDependencies are fine.
- Do not introduce `process.env`, `Buffer`, or `require()` into package `src/`.

### 0.4 STOP conditions (do not push through these)
- A token value in the DTCG source would not match the current hand-written value (parity test fails) → STOP, report the diff, do not "fix" by changing brand values.
- Collapsing `design-system` would break a real consumer → STOP, list the consumers, ask before a breaking major bump.
- Any package's `npm run build` or `npm test` fails after two genuine fix attempts → write `BLOCKED.md` and stop (Error Recovery Protocol, CLAUDE.md).
- Phase B custom-domain attach requires Cloudflare DNS that you cannot verify → complete everything else, then report the one manual step.

### 0.5 Verification requirement
"Done" means a command was run and the expected output observed. Each task below has a **Verify** gate — run it and paste the result into the PR description. CI green ≠ done; the Verify gate is done.

### 0.6 Ground truth about the repo (confirmed 2026-06-22)
- Package manager: **npm**, packages built/installed **per-package** (CI does `cd packages/<x> && npm ci --ignore-scripts && npm run build`). Install deps from inside the package dir.
- Publishing: tag `‹pkgdir›/v‹version›` (e.g. `design-tokens/v0.3.0`) triggers `.github/workflows/publish.yml`, which **strips `publishConfig.registry` and publishes PUBLIC to npmjs.org with provenance** using `NPM_TOKEN`. The `publishConfig.registry: npm.pkg.github.com` in package.json is a vestige — ignore it; packages are public on npmjs.org.
- `design-tokens/src/index.ts` is the hand-written TS token source (`colors.primary = '#0052CC'`, 4px-base `spacing.scale`, `typography`, `motion`, etc.). `packages/ui` depends on it via `file:../design-tokens`.
- `design-system/src/index.ts` re-exports from its **own** `src/tokens.ts` (the duplicate source to collapse).
- `apps/admin-studio-ui` already has Storybook (`@storybook/react-vite`, `build-storybook` script → `storybook-static/`) and `chromatic` as a devDep, but consumes **only** `studio-core` — it does **not** import `design-tokens`/`ui` yet.

---

## Phase A — Token unification + foundations (one PR)

Goal: one DTCG token source compiled by Style Dictionary to three outputs; `design-system` collapsed to a re-export; latent build/export bugs fixed; Changesets + semver in place; docs made consistent; UI packages added to the dependency order. **No app adoption yet** (that is Phase D).

### A1 — Fix the latent build/export bugs (do this first; smallest, unblocks the rest)
**Files:** `packages/design-tokens/package.json`, `packages/ui/package.json`
- `design-tokens` declares an `exports["./tokens"]` → `dist/tokens.mjs`, but `build` is `tsup src/index.ts` only, so `dist/tokens.mjs` is never produced. Either (a) remove the `./tokens` export, or (b) add `src/tokens.ts` as a build entry. **Choose (a)** unless a consumer imports `@latimer-woods-tech/design-tokens/tokens` (grep first).
- `ui` declares `exports["./Button"|"./Input"|"./Label"]` → `dist/Button.mjs` etc., but `build` is `tsup src/index.ts` only. Either add those as tsup entries (`tsup src/index.ts src/Button.tsx src/Input.tsx src/Label.tsx --format esm --dts`) or remove the subpath exports. **Prefer adding entries** (keeps the documented API).
- Rename the `prepublish` script to `prepublishOnly` in all three package.jsons (`design-tokens`, `design-system`, `ui`) — npm ≥7 does not run `prepublish` on publish. (CI calls it explicitly so this is hygiene, but do it.)

**Verify:** `grep -rn "design-tokens/tokens" packages apps` returns nothing before removing the export; then `cd packages/ui && npm install --ignore-scripts && npm run build && ls dist/` shows `Button.mjs Input.mjs Label.mjs index.mjs`.
**Commit:** `fix(design-tokens): align exports with build entries` (+ a `fix(ui): …`).

### A2 — Add the DTCG token source + Style Dictionary build to `design-tokens`
**New files:**
- `packages/design-tokens/tokens/*.json` — DTCG-format token files (`color.json`, `spacing.json`, `typography.json`, `motion.json`, `border.json`, `shadow.json`, `z-index.json`, `breakpoint.json`). Derive every value **1:1 from the current `src/index.ts`** — do not invent or "improve" values.
- `packages/design-tokens/style-dictionary.config.mjs` — config with three platforms:
  1. **css** → `dist/tokens.css` (`:root { --color-primary: #0052CC; … }`, kebab-case, dark-mode block if the source has dark values).
  2. **tailwind** → `dist/tailwind.preset.cjs` (a Tailwind preset object: `theme.extend.colors/spacing/fontSize/…`).
  3. **ts** → `dist/tokens.generated.ts` (typed constants).
- Install: `cd packages/design-tokens && npm install style-dictionary@^4 --save-dev`.

**Wire the build:** update `build` to run Style Dictionary then tsup, e.g.:
`"build": "style-dictionary build --config style-dictionary.config.mjs && tsup src/index.ts --format esm --dts"`
Add `dist/tokens.css` and `dist/tailwind.preset.cjs` to the package `files`/`exports` (new subpath exports `"./tokens.css"` and `"./tailwind-preset"`).

**Keep the TS API stable:** do **not** rewrite `src/index.ts`'s exported shape in this phase. `packages/ui` imports `colors`, `spacing`, etc. from it — those must keep working unchanged.

**Verify:** `cd packages/design-tokens && npm run build && node -e "const fs=require('fs');const css=fs.readFileSync('dist/tokens.css','utf8');if(!css.includes('--color-primary: #0052CC')) throw new Error('css missing primary');console.log('css ok')"` and `ls dist/` shows `tokens.css tailwind.preset.cjs index.mjs`.
**Commit:** `feat(design-tokens): DTCG source + Style Dictionary build (css/tailwind/ts outputs)`.

### A3 — Add a parity test (prevents source drift)
**File:** `packages/design-tokens/src/parity.test.ts`
- Import the hand-written constants from `./index` and the generated values from `../dist/tokens.generated` (or read the DTCG JSON directly).
- Assert key tokens are equal: `colors.primary` === DTCG `color.primary`, the spacing scale matches, etc. This is the guard that the DTCG source and the TS API never diverge.

**Verify:** `cd packages/design-tokens && npm test` passes including the new parity test. If it fails, that is a real STOP (§0.4) — the DTCG values were transcribed wrong; fix the JSON, never the brand.
**Commit:** `test(design-tokens): assert DTCG source matches TS token API`.

### A4 — Collapse `design-system` to a re-export of `design-tokens`
**Files:** `packages/design-system/`
- First: `grep -rn "@latimer-woods-tech/design-system" packages apps` to list consumers. If a consumer relies on a `design-system`-only name shape (e.g. `typography.styles` vs `design-tokens`' `typography.preset`), that is a STOP (§0.4) — report before proceeding.
- Add dependency: `"@latimer-woods-tech/design-tokens": "file:../design-tokens"`.
- Replace `src/index.ts` to re-export from `@latimer-woods-tech/design-tokens` instead of `./tokens.js`. Delete `src/tokens.ts`. Update `src/index.test.ts` accordingly.
- Bump `design-system` version: `0.1.0 → 0.2.0` (additive if names are preserved; if any exported name changes, `→ 1.0.0` and note the break in the changeset).

**Verify:** `cd packages/design-system && npm install --ignore-scripts && npm run build && npm test` passes; `grep -rn "from './tokens" packages/design-system/src` returns nothing.
**Commit:** `refactor(design-system): re-export design-tokens; remove duplicate token source`.

### A5 — Introduce Changesets + semver discipline
**Files:** repo root.
- `npm install -D @changesets/cli` at the **root**; `npx changeset init` (creates `.changeset/`).
- Add a short `.changeset/README.md` note: "Every change to `design-tokens`, `design-system`, `ui`, `a11y`, `forms`, `icons` ships a changeset. Cross-repo consumers (selfprime, capricast) depend on these as published npm packages — no silent breaking changes; deprecate one minor before removal (ADR 2026-06-22 decision 9)."
- Add a changeset for the changes made in A1–A4.
- Do **not** rewire the existing tag-based `publish.yml` in this phase (it still works). A follow-up can adopt `changeset publish`; for now Changesets governs versioning + changelogs.

**Verify:** `ls .changeset/*.md` shows the new changeset; `npx changeset status` runs clean.
**Commit:** `chore(repo): adopt Changesets for design-system package versioning`.

### A6 — Add the UI packages to the CLAUDE.md dependency order
**File:** `CLAUDE.md` (the numbered "Package Dependency Order" list).
- Insert after `validation` (currently #23), before `bodygraph`:
  - `design-tokens` (no deps) — DTCG source + Style Dictionary → CSS vars / TS / Tailwind preset.
  - `design-system` (deps: design-tokens) — re-export only.
  - `ui` (deps: design-tokens) — React primitives.
  - `a11y` (deps: design-tokens) — *planned*.
  - `forms` (deps: design-tokens, a11y) — *planned*.
  - `icons` (deps: design-tokens) — *planned*.
- Renumber the trailing entries (`bodygraph`, `constellation`).

**Verify:** the list is contiguous and `ui`/`design-system` appear **after** `design-tokens`.
**Commit:** `docs(repo): add Primus UI packages to dependency order`.

### A7 — Fix the doc contradictions surfaced in review (mechanical)
**Files:** `docs/PLATFORM_STANDARDS.md`, `docs/FACTORY_FRONTEND_STANDARDS.md`, `docs/DESIGN_SYSTEM_SCOPE.md`.
- **Spacing grid:** replace every "8px grid (exclusively)" / "4px grid" phrasing with the canonical line: *"4px base unit; default spacing steps are multiples of 8 (8/16/24/32)."*
- **Package names:** replace `@lwt/ui-tokens` / `@latimer-woods-tech/ui-tokens` with `@latimer-woods-tech/design-tokens` (the real package). In `ROADMAP.md`, leave the milestone label but append "(alias for `design-tokens`)".
- **Precedence headers (one line each):**
  - `PLATFORM_STANDARDS.md` §13–14: "Canonical for UI/UX **numbers** (contrast, Lighthouse, grid, package names). Implementation detail: FACTORY_FRONTEND_STANDARDS. Architecture: PRIMUS.md."
  - `FACTORY_FRONTEND_STANDARDS.md` top: "Canonical for a11y **implementation**; numeric targets are owned by PLATFORM_STANDARDS §13."
  - `DESIGN_SYSTEM_SCOPE.md` top: "Defines reuse **strategy** (shared vs app-specific). Technical architecture + delivery: PRIMUS.md."

**Verify:** `grep -rn "ui-tokens\|8px grid" docs/PLATFORM_STANDARDS.md docs/FACTORY_FRONTEND_STANDARDS.md` returns only intended/aliased references.
**Commit:** `docs(standards): reconcile grid, token package name, and doc precedence`.

### A8 — Log the design debt + deferred option in GAP_REGISTER
**File:** `docs/GAP_REGISTER.md` (match the existing table/entry format).
- One **open** entry: UI fragmentation / orphaned design packages → fix mechanism = PRIMUS.md §6 delivery path; status in-progress (Phase A).
- One **deferred** entry: USDC creator payouts for Capricast — out-of-roadmap, revisit when Capricast has real payout GMV (ADR decision 1). This is the entry the ADR points at; it must exist.

**Verify:** both entries present and formatted like their neighbors.
**Commit:** `docs(gap-register): log design-system debt + deferred USDC-payouts option`.

### Phase A definition of done
- `cd packages/design-tokens && npm run build && npm test` → green, `dist/tokens.css` + `dist/tailwind.preset.cjs` exist, parity test passes.
- `cd packages/design-system && npm run build && npm test` → green, no local `tokens.ts`.
- `cd packages/ui && npm run build && npm test` → green, subpath dist files exist.
- `.changeset/` initialized with a changeset; `CLAUDE.md` dependency order updated; doc contradictions fixed; GAP_REGISTER entries added.
- Open the PR; paste each Verify result. Do not self-merge; request review.

---

## Phase B — primusui.com showcase (second PR)

Goal: deploy the **existing** `admin-studio-ui` Storybook to Cloudflare Pages on `primusui.com`, plus a token-reference page. Ships the visible front door with what already exists.

### B1 — Add a token-reference story
**Files:** `apps/admin-studio-ui/src/stories/` (or wherever stories live).
- Add `design-tokens` as a devDependency of admin-studio-ui (`file:../../packages/design-tokens`).
- Add a Storybook MDX/TSX "Design Tokens" doc page that imports `dist/tokens.css` and renders swatches/spacing/type from the generated CSS variables. Keep it simple — a single page proving the token source renders.

**Verify:** `cd apps/admin-studio-ui && npm run build-storybook` produces `storybook-static/` with the Tokens page; open `storybook-static/index.html` locally and confirm it renders.
**Commit:** `feat(admin-studio-ui): add Primus token-reference story`.

### B2 — Cloudflare Pages project + deploy workflow
**Files:** `.github/workflows/deploy-primusui.yml` (model it on an existing app deploy workflow).
- Build step: `cd apps/admin-studio-ui && npm ci && npm run build-storybook`.
- Deploy `storybook-static/` to a new CF Pages project `primusui` via `cloudflare/wrangler-action` (or `cloudflare/pages-action`). Use the **least-privilege Pages-write token** from GCP Secret Manager (`cf-token-*`, per CLAUDE.md), not a broad token.
- Trigger: `workflow_dispatch` + push to the branch touching `apps/admin-studio-ui/**` or `packages/design-tokens/**`.

**Verify (staging):** the workflow run succeeds and `curl -I https://primusui.pages.dev` → `200`.
**Commit:** `chore(ci): deploy admin-studio-ui Storybook to primusui Cloudflare Pages`.

### B3 — Attach the custom domain `primusui.com`
- In Cloudflare, attach `primusui.com` to the `primusui` Pages project (domain is already owned on this account; zone exists). This may require a DNS/CNAME confirmation in the CF dashboard.
- **If you cannot complete the DNS attach via API/token:** finish B1–B2, then report this as the single manual operator step (§0.4).

**Verify (production):** `curl -I https://primusui.com/` → `200` (this is the CLAUDE.md Pages verification gate — do it with your own eyes).

### B4 — Register primusui.com in the service registry
**File:** `docs/service-registry.yml` — add a Pages entry (model it on the existing Storybook/Pages entries): `id: primusui`, `project_name: primusui`, `custom_domain: primusui.com`, deploy dir `apps/admin-studio-ui/storybook-static`, required secrets = the Pages-write CF token, notes pointing at `PRIMUS.md`.
**Verify:** `npm run validate:service-registry` passes.
**Commit:** `docs(service-registry): register primusui.com Pages showcase`.

### B5 — Cross-link the showcase
- `SURFACES.md`: append Primus/primusui.com to the existing **Docs/knowledge** surface entry (do **not** add a 16th surface).
- `STATE.md` or `FACTORY_V1.md`: one line noting Stage 6 is in flight with `PRIMUS.md` as the authority (only if STATE.md is hand-edited; if it is generated, update the generator input instead).
**Commit:** `docs: link primusui.com showcase from surfaces/state`.

### Phase B definition of done
- `curl -I https://primusui.com/` → `200`, Storybook renders Button/Card + the Tokens page.
- Service registry updated and validating. PR opened with the curl output pasted in.

---

## Phases C–E — outline only (return for a detailed plan before C)

- **Phase C — Complete the system (M12–M14).** De-orphan `ui` (wire `dist/tokens.css` import + consume tokens in components); build `@latimer-woods-tech/a11y` (focus/keyboard/contrast hooks), `forms` (validated primitives), `icons` (SVG + React, sized to tokens). Each new component lands as a Storybook story on primusui.com and is axe-clean. Each new package: own package.json mirroring the `ui` setup, added to `publish.yml`'s dep loop, JSDoc ≥90%, coverage ≥90/90/85 (package gates).
- **Phase D — First adopter.** Wire `admin-studio-ui` to consume `design-tokens` (Tailwind preset + `tokens.css`) and replace its local `components/ui/*` (Button, Card, Dialog…) with `@latimer-woods-tech/ui`. Done = zero local button/card; Lighthouse a11y ≥95 on the main route.
- **Phase E — Roll + enforce (M15).** `xico-city` and `coh` adopt the CSS base layer. Add the **11th conformance dimension** (design-system adoption) + axe/Lighthouse budgets as **shadow**; flip to required only for repos already ≥80 (Stage 4 rule).

> Visual-regression (Chromatic — already a devDep) and a standalone showcase app are **deferred** until Phase D proves adoption; do not build them earlier (PRIMUS.md §5).

---

## Quick reference — commands

```bash
# start
git checkout main && git pull && git checkout -b feat/primus-stage6-phase-a

# per-package build/test (run from the package dir)
cd packages/design-tokens && npm install --ignore-scripts && npm run build && npm test
cd packages/design-system && npm install --ignore-scripts && npm run build && npm test
cd packages/ui            && npm install --ignore-scripts && npm run build && npm test

# changesets (root)
npm install -D @changesets/cli && npx changeset init && npx changeset

# storybook showcase (Phase B)
cd apps/admin-studio-ui && npm ci && npm run build-storybook   # → storybook-static/

# production verify (Phase B, with your own eyes)
curl -I https://primusui.com/   # expect 200
```

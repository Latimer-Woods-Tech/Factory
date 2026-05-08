# Factory Admin Studio — UI

React + Vite + Tailwind frontend for [Factory Admin Studio](../admin-studio/).

Deploys to **Cloudflare Pages**. Talks to the [`admin-studio` Worker](../admin-studio/) via fetch.

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173 (proxies /api → http://localhost:8787)
```

Build:

```bash
npm run build        # → dist/
npm run preview      # serve dist/
npm run test:e2e     # Playwright mobile smoke suite
npm run storybook    # Storybook local review (components + primary tabs)
npm run build-storybook
```

## Deploy

Deployed via Cloudflare Pages — `dist/` is uploaded by the GitHub Actions workflow at [`.github/workflows/deploy-admin-studio-ui.yml`](../../.github/workflows/deploy-admin-studio-ui.yml).

```
staging:    https://staging.admin-studio-ui.pages.dev
production: https://studio.thefactory.dev
alternate:  https://apunlimited.com
```

The staging Pages URL above is the currently verified live staging surface.
The production custom domain remains the intended production target.

Storybook visual regression is enforced by Chromatic in
`.github/workflows/factory-admin-ui-ci.yml` and Storybook static output is
deployed to Cloudflare Pages (`admin-studio-ui-storybook`) on `main`.

## Architecture summary

- **`stores/session.ts`** — Zustand store; persists JWT + env in `sessionStorage` (cleared on tab close).
- **`lib/api.ts`** — fetch wrapper. Adds `Authorization`, `X-Request-Id`, `X-Confirmed`, `X-Confirm-Token`, `X-Dry-Run` headers. Forces logout on 401.
- **`components/EnvironmentBanner.tsx`** — Safeguard #1: persistent color-coded banner.
- **`components/ConfirmDialog.tsx`** — Safeguard #2: tier-aware confirmation modal (click / type-to-confirm / cooldown).
- **`pages/LoginPage.tsx`** — Forces env selection *before* credentials (Safeguard #3).
- **`pages/Dashboard.tsx`** — Tabs shell. Each tab is a Phase A stub that grows over Phases B–H.

See [`docs/admin-studio/00-MASTER-PLAN.md`](../../docs/admin-studio/00-MASTER-PLAN.md).

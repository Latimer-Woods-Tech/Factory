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

## Architecture summary

- **`stores/session.ts`** — Zustand store; persists JWT + env in `sessionStorage` (cleared on tab close).
- **`lib/api.ts`** — fetch wrapper. Adds `Authorization`, `X-Request-Id`, `X-Confirmed`, `X-Confirm-Token`, `X-Dry-Run` headers. Forces logout on 401.
- **`components/EnvironmentBanner.tsx`** — Safeguard #1: persistent color-coded banner.
- **`components/ConfirmDialog.tsx`** — Safeguard #2 built on Radix AlertDialog (click / type-to-confirm / cooldown).
- **`components/ui/*`** — shadcn/Radix primitives (`AlertDialog`, `Sheet`, `Drawer`, `Tabs`, `Tooltip`, `DropdownMenu`, `Command`, `Toaster`).
- **`components/theme.tsx` + `components/ThemeToggle.tsx`** — semantic token + light/dark/system theme control.
- **`pages/LoginPage.tsx`** — Forces env selection *before* credentials (Safeguard #3).
- **`pages/Dashboard.tsx`** — Tabs shell. Each tab is a Phase A stub that grows over Phases B–H.

See [`docs/admin-studio/00-MASTER-PLAN.md`](../../docs/admin-studio/00-MASTER-PLAN.md).

## Widget container queries

Overview widgets are container-query driven so they adapt to where they are embedded (main layout, drawer, modal), not viewport width.

- Every widget root sets `container-type: inline-size` and a widget-specific `container-name`.
- Widget tier convention:
  - **narrow**: `< 320px` (default styles)
  - **medium**: `>= 320px` (`@[20rem]:...`)
  - **wide**: `>= 520px` (`@[32.5rem]:...`)
- Do not use viewport `sm:` / `md:` / `lg:` classes inside these widgets for layout switching.

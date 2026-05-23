# Latimer Woods Company Page

This directory hosts the static company landing page intended for `latwoodtech.com`.

## Deploy

The site deploys via Cloudflare Pages using the GitHub workflow at `.github/workflows/deploy-latwoodtech-web.yml`.

### Cloudflare setup

1. Add `latwoodtech.com` as a site in the Cloudflare dashboard.
2. Copy the Cloudflare nameservers and set them in GCP Cloud Domains for `latwoodtech.com`.
3. In Cloudflare Pages, attach `latwoodtech.com` as a custom domain to the `latwoodtech-com` project.
4. Enable redirects or enforce HTTPS if desired.

### Build

This site is authored in `apps/latwoodtech-web/src/` and built to `apps/latwoodtech-web/dist/`.
The brand animation assets live in `apps/latwoodtech-web/src/assets/`.
Run `npm run build:frontend` inside `apps/latwoodtech-web` before deploying locally.

### Public pulse feed

The homepage includes a same-origin public feed at `dist/data/pulse.json`.

It is generated during the build from:
- `docs/completion-tracker.json`
- a curated allowlist of branded public domains in `build.js`

This feed is intentionally low risk:
- no auth
- no secrets
- no operator endpoints
- no request IDs, session IDs, or internal infrastructure metadata
- no `*.workers.dev` exposure in the public UI

The pulse layer is designed to tell the story of operational rigor and progress without turning the landing page into an admin console.

### Public KPI model

The public surface exposes curated metrics that are safe to disclose:
- verified function count
- tracked capability count
- public surface count
- repos under measurement
- weighted progress and known coverage as high-level program indicators

Internal-only observability remains in Admin Studio and authenticated worker routes. If you need deeper live metrics later, add them to a public-safe aggregator first rather than fetching operator endpoints directly from the homepage.

### Secrets

The deploy workflow requires these repo secrets:
- `CF_API_TOKEN`
- `CF_ACCOUNT_ID`

These should be Cloudflare tokens with Pages deploy permissions.

## Project status

- `project_name`: `latwoodtech-com`
- `branch`: `main`
- `deploy target`: `dist`
- `initial verify`: `https://latwoodtech-com.pages.dev`
- `custom domain`: `https://latwoodtech.com`

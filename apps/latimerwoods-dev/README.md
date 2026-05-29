# latimerwoods-dev — Developer Index

Static Cloudflare Pages site that renders `docs/service-registry.yml` as a grouped index of every Factory service. Lives at https://dev.latimerwoods.dev.

## Build

```bash
cd apps/latimerwoods-dev
npm install
npm run build
# Output: dist/index.html + dist/styles.css
```

## Deploy

Automatic on every push to `main` that touches `docs/service-registry.yml`, `apps/latimerwoods-dev/**`, or `.github/workflows/deploy-latimerwoods-dev.yml`. See [.github/workflows/deploy-latimerwoods-dev.yml](../../.github/workflows/deploy-latimerwoods-dev.yml).

## What it shows

Every service from `service-registry.yml`, grouped by surface zone:

- **Customer Products** — selfprime.net, capricast.com, cypherofhealing.com, xicocity.com
- **Operator Surface** — apunlimited.com (Admin Studio)
- **Production Infrastructure** — latwoodtech.work (machine-to-machine APIs)
- **Developer Surface** — latimerwoods.dev (staging, dev tools, PR previews)
- **Marketing** — latwoodtech.com
- **Unhomed** — services still on `*.workers.dev`

Status reflects the registry's declared `deployment_status` / `custom_domain_status`. Not a live health probe — open the `/health` link to check.

# status-prober

Cron-driven uptime prober for the four canonical brand surfaces.

- **Probes every 5 minutes** (`*/5 * * * *`).
- Issues a `HEAD` request to each surface (falls back to `GET` on `405`/`501`), 8-second per-probe deadline, `redirect: 'follow'`.
- Persists the latest envelope to KV under key `current`.
- Exposes `GET /current` with `Access-Control-Allow-Origin: *` and `Cache-Control: public, max-age=60` so the static `https://latwoodtech.com/status/` page can fetch near-live data with a graceful fall-back to the build-time `pulse.json` snapshot.

Public URL: **https://status.latwoodtech.work/**

## Endpoints

| Path       | Method | Description                                                                |
| ---------- | ------ | -------------------------------------------------------------------------- |
| `/`        | GET    | Terse JSON pointer at `/current` + `/health`.                              |
| `/health`  | GET    | `{ ok, worker, environment, lastProbe, surfaceCount }`.                    |
| `/current` | GET    | Latest probe envelope (`{ generatedAt, results }`); `503` if KV is cold.   |

## Envelope shape

```json
{
  "generatedAt": "2026-05-23T00:00:00.000Z",
  "results": [
    { "name": "Prime Self", "url": "https://selfprime.net", "alive": true, "status": 200, "durationMs": 142 },
    { "name": "Capricast", "url": "https://capricast.com", "alive": true, "status": 200, "durationMs": 98 },
    { "name": "Cypher of Healing", "url": "https://cypherofhealing.com", "alive": true, "status": 200, "durationMs": 110 },
    { "name": "AP Unlimited", "url": "https://apunlimited.com", "alive": true, "status": 200, "durationMs": 87 }
  ]
}
```

## Bindings

| Binding | Type | Notes |
| --- | --- | --- |
| `STATUS_KV` | KV namespace | `status-prober-current` — id `7e84db7a35c74021af5311ed1fdd7b48` |
| `STATUS_RATE_LIMITER` | Rate limiter | Namespace `1012`, `120 req/min` per key |

There are **no Worker secrets**. Probing is unauthenticated by design.

## First-time provisioning

```bash
# 1. KV namespace (already provisioned — id documented in wrangler.jsonc)
wrangler kv namespace create status-prober-current

# 2. Custom domain route (already declared in wrangler.jsonc env.production.routes;
#    deploy will attach it on first run). If the route fails to attach you can
#    add it via the CF API:
curl -s -X POST \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"hostname":"status.latwoodtech.work","service":"status-prober","environment":"production"}' \
  "https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/workers/domains"

# 3. Deploy
npm install
npm run deploy
```

## Local development

```bash
npm install
npm run dev          # wrangler dev — does not run cron, but /current + /health respond
npm test             # vitest with v8 coverage (thresholds: 90/90/85)
npm run typecheck    # tsc --noEmit
npm run lint         # eslint --max-warnings 0
```

## Triggering the cron by hand

Wrangler can fire the scheduled handler directly:

```bash
npx wrangler cron trigger status-prober --env production
```

Or, against the workers.dev URL (only available in dev sessions):

```bash
curl -X POST "https://status-prober.adrper79.workers.dev/__scheduled?cron=*/5+*+*+*+*"
```

## Verification (per CLAUDE.md)

```bash
curl -s https://status.latwoodtech.work/health         # expect 200, JSON with lastProbe
curl -s https://status.latwoodtech.work/current        # expect 200, JSON with results[] of length 4
curl -I https://status.latwoodtech.work/current        # expect access-control-allow-origin: *
```

## Consumer

The `apps/latwoodtech-web` Pages site fetches `/current` from this Worker on the
`/status/` page, with an 8-second timeout and a graceful fall-back to
`/data/pulse.json#pulse.surfaceHealth` (the build-time snapshot) on timeout or
non-2xx.

Registered in `docs/service-registry.yml` as `status-prober`.

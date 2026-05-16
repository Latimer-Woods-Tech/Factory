# webhook-fanout

Cloudflare Worker that receives Stripe webhooks, verifies HMAC-SHA256 signatures, deduplicates via KV (7-day TTL), filters synthetic test customers at source, and fans out to **ChartMogul** (subscription analytics) and **Loops** (lifecycle emails).

- **Endpoint:** `https://webhooks.latwoodtech.com/stripe`
- **Handles:** `POST /stripe` (Stripe webhook receiver), `GET /health`
- **Issue:** [#641](https://github.com/Latimer-Woods-Tech/factory/issues/641)

---

## Architecture

```
Stripe → POST /stripe
         │
         ├─ 1. Verify HMAC-SHA256 (constant-time, Web Crypto)
         ├─ 2. Idempotency check (KV, 7-day TTL keyed on event.id)
         ├─ 3. Synthetic customer filter (metadata + email regex)
         └─ 4. waitUntil() fan-out
                ├─ Loops: PUT /contacts/update → POST /events/send
                └─ ChartMogul: upsert customer (subscription events only)
```

Fan-out runs inside `waitUntil()` — Stripe gets a 200 response immediately while work continues in the background, well within the 5 s acknowledgement window.

---

## Handled Stripe events

| Event | Loops event name | ChartMogul |
|---|---|---|
| `customer.created` | `stripe.customer.created` | — |
| `customer.updated` | `stripe.customer.updated` | — |
| `customer.subscription.created` | `stripe.customer.subscription.created` | upsert customer |
| `customer.subscription.updated` | `stripe.customer.subscription.updated` | upsert customer |
| `customer.subscription.deleted` | `stripe.customer.subscription.deleted` | upsert customer |
| `customer.subscription.trial_will_end` | `stripe.customer.subscription.trial_will_end` | upsert customer |
| `invoice.paid` | `stripe.invoice.paid` | — |
| `invoice.payment_failed` | `stripe.invoice.payment_failed` | — |

---

## Required secrets

Set these via `wrangler secret put <NAME>` or add to org-level GitHub Actions secrets:

| Secret | Description |
|---|---|
| `STRIPE_WEBHOOK_SECRET` | Signing secret from Stripe dashboard (after endpoint registration) |
| `CHARTMOGUL_API_KEY` | ChartMogul API key — see issue #641 dependencies |
| `LOOPS_API_KEY` | Loops API key — injected directly (not via proxy) |

---

## Deployment steps

### 1. Provision the KV namespace (once)

```bash
wrangler kv namespace create webhook-fanout-idempotency
wrangler kv namespace create webhook-fanout-idempotency --preview
```

Copy the IDs into `wrangler.jsonc`, replacing `REPLACE_WITH_KV_NAMESPACE_ID` and `REPLACE_WITH_KV_PREVIEW_NAMESPACE_ID`.

### 2. Set secrets

```bash
wrangler secret put STRIPE_WEBHOOK_SECRET --env production
wrangler secret put CHARTMOGUL_API_KEY --env production
wrangler secret put LOOPS_API_KEY --env production
```

### 3. Deploy

```bash
npm run deploy   # deploys to production env
```

### 4. Register the Stripe webhook endpoint (after first deploy)

1. Stripe Dashboard → Developers → Webhooks → **Add endpoint**
2. URL: `https://webhooks.latwoodtech.com/stripe`
3. Subscribe to all 8 events listed in the table above
4. Copy the signing secret → set as `STRIPE_WEBHOOK_SECRET`

---

## Local development

```bash
npm run dev          # wrangler dev
npm run test         # vitest run --coverage
npm run typecheck    # tsc --noEmit
```

---

## Synthetic customer filter

Events are silently dropped (200 returned, no fan-out) when the Stripe customer object matches any of:

- `metadata.synthetic === "true"`
- `metadata.source === "smoke_test"`
- `email` matches `/(?:gatecheck_|test_|smoke_|@example\.com)/i`

This is a belt-and-suspenders check alongside the `metadata.synthetic` flag set on Stripe test customers.

---

## ChartMogul data source

All subscription data is written to data source `ds_036fc9e8-4e03-11f1-ae13-0f418c0c0aca` ("Stripe (direct sync)").

> **Do not** enable ChartMogul's or Loops's built-in Stripe integration — this Worker is the authoritative sync path and enabling their native integrations will double-count data.

---

## Follow-up

Full `upsertChartMogulSubscription` (invoice/transaction reflection) is stubbed and will be completed in the `@latimer-woods-tech/webhooks` package extraction (follow-up issue).

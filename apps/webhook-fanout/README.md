# webhook-fanout

Cloudflare Worker that receives Stripe webhooks, verifies HMAC-SHA256 signatures, deduplicates via KV (7-day TTL), filters synthetic test customers at source, and fans out to STACK.md-approved **PostHog + factory_events** (analytics) and **Resend** (lifecycle emails).

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
               ├─ PostHog: capture `stripe.*` analytics events
               ├─ factory_events: insert first-party `stripe.*` rows
               └─ Resend: send lifecycle email updates
```

Fan-out runs inside `waitUntil()` — Stripe gets a 200 response immediately while work continues in the background, well within the 5 s acknowledgement window.

---

## Handled Stripe events

| Event | Analytics event | Lifecycle email |
|---|---|---|
| `customer.created` | `stripe.customer.created` | Resend |
| `customer.updated` | `stripe.customer.updated` | Resend |
| `customer.subscription.created` | `stripe.customer.subscription.created` | Resend |
| `customer.subscription.updated` | `stripe.customer.subscription.updated` | Resend |
| `customer.subscription.deleted` | `stripe.customer.subscription.deleted` | Resend |
| `customer.subscription.trial_will_end` | `stripe.customer.subscription.trial_will_end` | Resend |
| `invoice.paid` | `stripe.invoice.paid` | Resend |
| `invoice.payment_failed` | `stripe.invoice.payment_failed` | Resend |

---

## Required secrets

Set these via `wrangler secret put <NAME>` or add to org-level GitHub Actions secrets:

| Secret | Description |
|---|---|
| `STRIPE_WEBHOOK_SECRET` | Signing secret from Stripe dashboard (after endpoint registration) |
| `POSTHOG_API_KEY` | PostHog project API key |
| `RESEND_API_KEY` | Resend API key |

---

## Deployment steps

### 1. Provision the KV namespace (once)

```bash
wrangler kv namespace create webhook-fanout-idempotency
wrangler kv namespace create webhook-fanout-idempotency --preview
```

Copy the IDs into `wrangler.jsonc`, replacing `REPLACE_WITH_KV_NAMESPACE_ID` and `REPLACE_WITH_KV_PREVIEW_NAMESPACE_ID`.

Provision the `factory_events` D1 database and replace both `REPLACE_WITH_D1_DATABASE_ID` placeholders in `wrangler.jsonc`:

- top-level `d1_databases[0].database_id` for local/preview development
- `env.production.d1_databases[0].database_id` for production deploys

### 2. Set secrets

```bash
wrangler secret put STRIPE_WEBHOOK_SECRET --env production
wrangler secret put POSTHOG_API_KEY --env production
wrangler secret put RESEND_API_KEY --env production
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

## Analytics store

All handled Stripe events are captured in PostHog and inserted into the first-party `factory_events` D1 database using the `stripe.*` event names above.

> **Do not** enable ChartMogul's or Loops's built-in Stripe integrations — this Worker intentionally avoids unratified vendors and keeps analytics/email on the canonical Factory stack.

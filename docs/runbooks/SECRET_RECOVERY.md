# Secret Recovery Runbook

_Owner: adrper79-dot. Last updated 2026-05-08._

## Purpose
Re-derive every secret from its upstream source if GitHub access is lost or org secrets are corrupted.

## Inventory & re-derivation steps

| Secret | Source | Re-derivation |
|---|---|---|
| `ANTHROPIC_API_KEY` | console.anthropic.com → Settings → API Keys | Generate new key, revoke old |
| `GROK_API_KEY` | console.x.ai → API Keys | Generate new key |
| `GEMINI_API_KEY` | aistudio.google.com → Get API key | Generate new key |
| `GROQ_API_KEY` | console.groq.com → API Keys | Generate new key |
| `OPENAI_API_KEY` | platform.openai.com → API keys | Generate new key |
| `CLOUDFLARE_API_TOKEN` | dash.cloudflare.com → My Profile → API Tokens | Use template "Edit Cloudflare Workers" |
| `CF_API_TOKEN` | Same as above (legacy alias) | Same as above |
| `CLOUDFLARE_ACCOUNT_ID` | dash.cloudflare.com → right sidebar | Copy ID, no regeneration needed |
| `STRIPE_SECRET_KEY` / `STRIPE_PUBLISHABLE_KEY` | dash.stripe.com → Developers → API keys | Roll keys; update all 14 STRIPE_PRICE_* by re-listing prices |
| `STRIPE_WEBHOOK_SECRET_*` | dash.stripe.com → Developers → Webhooks → endpoint | Click "Reveal" or rotate |
| `NEON_CONNECTION_STRING` | console.neon.tech → project → Connection Details | Generate new role/password if needed |
| `RESEND_API_KEY` | resend.com → API Keys | Generate new key |
| `SENTRY_AUTH_TOKEN` | sentry.io → User Settings → Auth Tokens | Generate new with `project:write`, `org:read` |
| `SENTRY_DSN_*` | sentry.io → project → Client Keys | DSNs are public-safe, no regen needed |
| `DEEPGRAM_API_KEY` | console.deepgram.com → API Keys | Generate new |
| `ELEVENLABS_API_KEY` / voice IDs | elevenlabs.io → Profile → API Key | Generate new key; voice IDs from voice library |
| `TELNYX_API_KEY` | portal.telnyx.com → API Keys | Generate new V2 key |
| `POSTHOG_*` | posthog.com → Project → Settings → API Keys | Personal API keys for admin endpoints |
| `R2_*`, `FACTORY_R2_*` | dash.cloudflare.com → R2 → Manage API Tokens | Generate new with bucket-scoped permissions |
| `STREAM_*` | dash.cloudflare.com → Stream → API | Account ID + customer subdomain |
| `HYPERDRIVE_*` | dash.cloudflare.com → Workers → Hyperdrive | Connection string; set in wrangler |
| `BETTER_AUTH_SECRET_*` | Generate locally: `openssl rand -hex 32` | Random, store in 1Password vault |
| `NPM_TOKEN` | npmjs.com → Access Tokens → Granular | Scope: `@latimer-woods-tech/*` publish |
| `MINTLIFY_API` | mintlify.com dashboard | Generate from Mintlify settings |
| `PUSHOVER_TOKEN` / `PUSHOVER_USER` | pushover.net → Your Applications + User Key | Already personal, keep |
| `FACTORY_APP_ID` / `FACTORY_APP_CLIENT_ID` | github.com/organizations/Latimer-Woods-Tech/settings/apps/factory-cross-repo | App ID is constant; regenerate private key as PEM |
| `FACTORY_APP_PRIVATE_KEY` | Same as above → "Generate a private key" | Download `.pem`, paste full contents incl. headers |
| `FACTORY_APP_INSTALLATION_ID` | App page → "Install App" → installed org | Static ID once installed |
| `GH_PAT` / `GH_TOKEN_ISSUE` | github.com/settings/tokens (classic) | `repo`, `workflow`, `read:org` scopes |
| `STRIPE_PRICE_*` (14 keys) | dash.stripe.com → Products → click product → Prices | Copy `price_*` IDs for live mode |
| `SMOKE_*` (test creds) | Stored in 1Password | Recover from 1Password vault |

## After full rotation

1. Run `Bootstrap Publish All Packages` workflow to verify NPM credentials.
2. Trigger one Worker deploy per app to verify Cloudflare creds.
3. Run `Smoke — Prime Self Production` to verify Stripe keys end-to-end.
4. Verify Sentry receives a test event from each app.

## Last drill
Never run. Schedule one for 2026-06-01.

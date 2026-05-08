# Campaign Cron Worker — Reusable Template

> Used by WB-5 and any future telephony-dispatch cron workers.
> Copy the patterns below verbatim; customise only the constants at the top.

---

## 1. wrangler.jsonc bindings

Every campaign cron worker needs these bindings. Add them alongside the app's
existing Hyperdrive (`DB`) and rate-limiter (`AUTH_RATE_LIMITER`) entries.

```jsonc
{
  // ── Neon Postgres via Hyperdrive ──────────────────────────────────────────
  "hyperdrive": [
    { "binding": "DB", "id": "<HYPERDRIVE_ID>" }
  ],

  // ── Flagship feature flags ────────────────────────────────────────────────
  "flagship": { "binding": "FLAGS" },

  // ── Flag telemetry (shared flag-meter D1) ────────────────────────────────
  "d1_databases": [
    {
      "binding": "FLAG_TELEMETRY",
      "database_id": "f03af37d-11d9-4428-b0db-b3cdca8fe7c4",
      "database_name": "flag-meter"
    }
  ],

  // ── Campaign KV — stores serialised campaign state between runs ──────────
  "kv_namespaces": [
    { "binding": "CAMPAIGN_KV", "id": "<KV_NAMESPACE_ID>" }
  ],

  // ── Cron trigger — every 15 minutes during business hours ────────────────
  // Adjust to match your campaign cadence. Calling-hours enforcement is done
  // in code (canDispatchCall), not via cron schedule, so this can be broader.
  "triggers": {
    "crons": ["*/15 * * * *"]
  }
}
```

---

## 2. Env interface additions

```typescript
// src/env.ts

export interface Env {
  // existing...
  DB: Hyperdrive;
  FLAGS: Fetcher;
  FLAG_TELEMETRY: D1Database;
  CAMPAIGN_KV: KVNamespace;

  // secrets — set via wrangler secret put
  TELNYX_API_KEY: string;
  TELNYX_FROM_NUMBER: string;   // E.164, e.g. +13125551234
  DEEPGRAM_API_KEY: string;
  ELEVENLABS_API_KEY: string;
  ELEVENLABS_VOICE_ID: string;
  POSTHOG_KEY: string;
  ENVIRONMENT: string;
}
```

---

## 3. Handler boilerplate

```typescript
// src/cron/campaign-dispatch.ts
import { createFlagClient } from '@latimer-woods-tech/flags';
import { createDb }          from '@latimer-woods-tech/neon';
import { canDispatchCall }   from '@latimer-woods-tech/compliance';
import { createCallJob }     from '@latimer-woods-tech/telephony';
import { trackEvent }        from '@latimer-woods-tech/analytics';
import type { Env }          from '../env.js';

const APP_NAME = 'your-app-name'; // replace with the app slug constant

/**
 * campaignDispatch — scheduled entry point.
 *
 * Called by the Cloudflare cron trigger. Fetches contacts eligible for
 * outreach, enforces calling hours, checks the kill-switch flag, and
 * dispatches calls via Telnyx through @latimer-woods-tech/telephony.
 */
export async function campaignDispatch(
  event: ScheduledEvent,
  env: Env,
  ctx: ExecutionContext,
): Promise<void> {
  const flags = createFlagClient(env, { app: APP_NAME, env: env.ENVIRONMENT });
  const db    = createDb(env.DB);

  // ── Kill-switch check ────────────────────────────────────────────────────
  // Set {APP_NAME}:ks:maintenance_mode = true in Cloudflare Flagship to
  // instantly halt all outbound dispatch without a code deploy.
  const inMaintenance = await flags.getBool(`${APP_NAME}:ks:maintenance_mode`);
  if (inMaintenance) {
    console.log('[campaign-dispatch] kill switch active — skipping run');
    return;
  }

  // ── Fetch eligible contacts ───────────────────────────────────────────────
  const contacts = await db
    .select()
    .from(contactsTable)
    .where(eq(contactsTable.status, 'pending'))
    .limit(50); // batch size — tune per volume

  if (contacts.length === 0) {
    console.log('[campaign-dispatch] no pending contacts');
    return;
  }

  // ── Dispatch calls ────────────────────────────────────────────────────────
  const dispatched: string[] = [];
  const skipped:    string[] = [];

  for (const contact of contacts) {
    // ── Calling-hours enforcement (FDCPA / TCPA) ────────────────────────────
    // canDispatchCall checks the contact's timezone vs. allowed hours (8am–9pm
    // local) and the do-not-call registry status stored in the compliance table.
    const allowed = await canDispatchCall(db, contact.id);
    if (!allowed.ok) {
      skipped.push(contact.id);
      console.log(`[campaign-dispatch] skip ${contact.id}: ${allowed.reason}`);
      continue;
    }

    try {
      // ── Dispatch via telephony ────────────────────────────────────────────
      await createCallJob(env, {
        to:       contact.phone,
        from:     env.TELNYX_FROM_NUMBER,
        script:   buildScript(contact),   // your script-builder function
        voiceId:  env.ELEVENLABS_VOICE_ID,
      });

      dispatched.push(contact.id);

      // ── PostHog outcome event ─────────────────────────────────────────────
      // Use the factory_events + PostHog dual-write pattern so both
      // the real-time PostHog funnel and the SQL audit table stay in sync.
      ctx.waitUntil(
        trackEvent(env, {
          event:      'campaign_call_dispatched',
          distinctId: contact.id,
          properties: {
            app:         APP_NAME,
            contact_id:  contact.id,
            campaign_id: contact.campaignId,
            env:         env.ENVIRONMENT,
          },
        }),
      );
    } catch (err) {
      console.error(`[campaign-dispatch] dispatch failed for ${contact.id}:`, err);
    }
  }

  console.log(
    `[campaign-dispatch] dispatched=${dispatched.length} skipped=${skipped.length} total=${contacts.length}`,
  );
}
```

---

## 4. Calling-hours enforcement pattern

`canDispatchCall` from `@latimer-woods-tech/compliance` encapsulates FDCPA / TCPA logic:

```typescript
import { canDispatchCall } from '@latimer-woods-tech/compliance';

const check = await canDispatchCall(db, contactId);

if (!check.ok) {
  // check.reason is one of:
  //   'outside_calling_hours'   — before 8am or after 9pm local time
  //   'do_not_contact'          — contact has an active DNC record
  //   'consent_not_granted'     — sms/phone consent not on file
  console.log(`Skipping: ${check.reason}`);
  return;
}

// Proceed with dispatch
```

The compliance check reads from the `consent_log` table (written by
`@latimer-woods-tech/compliance`'s ConsentService) and the contact's
stored `timezone` field. If `timezone` is null the check defaults to UTC
and returns `outside_calling_hours` during the risk window.

---

## 5. PostHog outcome event pattern

```typescript
import { trackEvent } from '@latimer-woods-tech/analytics';

// Fire-and-forget — wrap in ctx.waitUntil so the Worker doesn't wait.
ctx.waitUntil(
  trackEvent(env, {
    event:      'campaign_call_dispatched',
    distinctId: contactId,          // PostHog person identity
    properties: {
      app:         APP_NAME,
      campaign_id: campaignId,
      outcome:     'dispatched',    // dispatched | skipped | failed
      reason:      null,            // populate for skipped/failed
      env:         env.ENVIRONMENT,
    },
  }),
);
```

**Standard outcome events:**

| Event name | When to fire |
|---|---|
| `campaign_call_dispatched` | Call job successfully queued in Telnyx |
| `campaign_call_skipped` | canDispatchCall returned `ok: false` |
| `campaign_call_failed` | createCallJob threw an error |
| `campaign_run_complete` | End of each cron invocation (with totals) |

---

## 6. Wiring the cron handler in src/index.ts

```typescript
import { campaignDispatch } from './cron/campaign-dispatch.js';
import type { Env }         from './env.js';

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // ... Hono app handler
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    await campaignDispatch(event, env, ctx);
  },
};
```

---

## 7. Secrets checklist

Add these via `wrangler secret put` before deploying:

| Secret | Description |
|---|---|
| `TELNYX_API_KEY` | Telnyx API key — create at telnyx.com/account/api-keys |
| `TELNYX_FROM_NUMBER` | Verified E.164 Telnyx number for outbound calls |
| `DEEPGRAM_API_KEY` | Deepgram key for speech-to-text (voicemail detection) |
| `ELEVENLABS_API_KEY` | ElevenLabs key for TTS narration |
| `ELEVENLABS_VOICE_ID` | ElevenLabs voice ID for this campaign |
| `POSTHOG_KEY` | PostHog project API key |

---

## 8. Flag keys to register

When adding this worker to a new app, append these entries to `flags/registry.yml`:

```yaml
- key: "{appName}:ks:maintenance_mode"
  type: kill_switch
  description: "Kill switch — enables maintenance mode for {appName}"
  apps: ["{appName}"]
  owner: {appName}
  status: active
  default_value: false
  created_at: "YYYY-MM-DD"
  cleanup_policy: permanent

- key: "{appName}:ops:llm_tier"
  type: ops
  description: "LLM tier for {appName}: balanced | fast | quality"
  apps: ["{appName}"]
  owner: {appName}
  status: active
  default_value: "balanced"
  created_at: "YYYY-MM-DD"
  cleanup_policy: permanent
```

The `new-app` / `scaffold.mjs` script appends these automatically when creating
a new app. For manually created workers, add them by hand and update the
inlined `REGISTRY` array in `apps/admin-studio/src/routes/flagship.ts` to match.

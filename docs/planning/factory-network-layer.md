# Factory Network Layer — Design & Build Plan

**Status:** Ratified — 2026-06-08  
**Decider:** @adrper79-dot  
**Canonical registry:** `docs/service-registry.yml` (network surface added as `factory-network`)  
**Canonical event taxonomy:** `docs/registry/network-events.yml` (Platform Standard §12)  
**Synergize scanner:** `scripts/opportunity-scan.mjs` — `cross-app-network-gap` + `missing-network-token`

---

## 1. Vision

The Factory apps — selfprime, capricast, coh, xico-city — serve the same archetype: specialized gift-holders seeking community and monetization. Today they are a *portfolio*: siloed products that happen to share infrastructure. Each user registers independently, builds an identity independently, and has no path between apps.

The network layer turns this into a *network*: verified cross-app identity + a shared event stream that makes each app smarter about who the user already is across the ecosystem. A selfprime user who completes a Human Design reading is already a capricast viewer archetype. A capricast creator with a public channel has a discoverable gift. The identity seam already exists. This plan wires it.

**Network math vs portfolio math:** a user who links selfprime + capricast accounts generates cross-sell signal, informs content recommendations, and increases LTV across both products. That compounding is the goal.

---

## 2. Architectural Decisions (locked)

### 2.1 Identity split: capricast verifies, factory-core-api records

**Capricast is the OAuth2 IdP** — user-facing verification ("prove you own both accounts"). Already fully built. Correct owner: capricast is the platform entry point, the social graph anchor, and has the most established user session infrastructure.

**factory-core-api is the network record store** — stores the resulting link in `factory_network_links` and ingests cross-app events into `factory_network_events`. Correct owner: factory-core-api is platform-level infrastructure, not a product. If capricast were ever transferred or spun out, the platform network must not go with it. This split also aligns with the plan already documented in `docs/runbooks/lessons-learned.md`: *"A future `factory_core` Neon project will aggregate events across all apps when factory-admin is built."* The network layer is that future project, now landing.

These two concerns are complementary, not competing.

### 2.2 Network surface: `network.latwoodtech.work`

factory-core-api gains a second custom domain: `network.latwoodtech.work`. Same worker, same Hyperdrive, separate purpose-clear DNS entry. Apps call `https://network.latwoodtech.work/v1/network/*` for all network operations. `core.latwoodtech.work` remains the CI/CD auth surface.

### 2.3 Network DB: dedicated spare Neon project

The network tables (`factory_network_links`, `factory_network_events`, `factory_app_keys`) live in a dedicated Neon project — the `factory_core` project slot that was always planned for cross-app aggregation. factory-core-api gets a second Hyperdrive binding `NETWORK_DB` pointing to this project. This keeps network data cleanly separated from CI/CD ingestion data (the existing `DB` binding).

### 2.4 Zero-user baseline

Both selfprime and capricast have zero linked accounts today (platform pre-launch). No backfill migration is needed. GDPR deletion cascade is a future concern. Phase 0 starts clean.

### 2.5 Synergize = cross-app network scanners

The `synergize` concept agreed in session (periodic cross-app opportunity scan across growth+maintain apps) is implemented as two new scanner types in `opportunity-scan.mjs`:
- `cross-app-network-gap` — fires when `link_rate < 0.05` or `cross_app_funnel < 10`; routes to **brief** (product/strategic decision)
- `missing-network-token` — fires when a deployed product app has no `FACTORY_NETWORK_TOKEN` configured; routes to **auto-file** (platform integration obligation, exempt from mode restrictions)

These are wired. Gate routing is correct.

### 2.6 Platform integration exemption

Apps in any mode (including `maintain`, `hands-off`) receive proposals for platform-mandated integration: `missing-network-token`, `missing-registry`. These are infrastructure obligations, not product features. The `new` mode is now in the lifecycle and suppresses all product proposals while allowing platform integration proposals. coh can be wired in Phase 4 without a mode bump — the exemption covers it.

---

## 3. What Is Already Built

| Component | Status | Location |
|---|---|---|
| Capricast OAuth2 IdP (`/oauth/authorize`, `/token`, `/userinfo`) | **Live** | `capricast/apps/worker/src/routes/oauth-provider.ts` |
| selfprime OAuth consumer (capricast) | **Live** | `HumanDesign/workers/src/handlers/account-link-oauth.js` |
| selfprime `account_links` table | **Live** | selfprime Neon DB |
| factory-core-api at `core.latwoodtech.work` | **Live** | Hyperdrive `efe957f404bb457593e6bd08b733b7c4` |
| factory-core-api service-key pattern | **Live** | `WEBHOOK_FANOUT_INGEST_KEY`, `SUPERVISOR_PUSH_KEY`, `AUDIT_INGEST_KEY` |
| Platform Brain SENSE→EXECUTE loop (Phases 0–4) | **Live** | `scripts/` + `generate-founder-stats.yml` |
| Synergize scanners (`cross-app-network-gap`, `missing-network-token`) | **Live (code)** | `scripts/opportunity-scan.mjs` + `scripts/gate.mjs` |
| Platform Standard §12 event taxonomy | **Live (docs)** | `docs/registry/network-events.yml` |
| `new` mode + platform integration exemption | **Live (docs)** | `docs/app-lifecycle.yml` |

**What is not yet built:**
- `network.latwoodtech.work` custom domain on factory-core-api
- `NETWORK_DB` Hyperdrive binding (spare Neon project)
- `factory_network_links`, `factory_network_events`, `factory_app_keys` tables
- factory-core-api `/v1/network/*` routes + `src/lib/app-auth.ts`
- factory-core-api JWT audience pattern updated for `network-read`
- App-side `lib/network.ts` helpers + event fire wiring
- Link registration sync (selfprime callback → `/v1/network/links`)
- Link prompt UX (capricast creator dashboard primary, selfprime post-reading secondary)
- `network-sense.mjs` feeding `graph.network` metrics into entity-graph.json

---

## 4. Architecture

### 4.1 Topology

```
                    ┌──────────────────────────────────────────┐
                    │  factory-core-api (core.latwoodtech.work) │
                    │       + network.latwoodtech.work alias     │
                    │                                            │
                    │  /v1/auth/token      (OIDC→JWT, CI/CD)    │
                    │  /v1/gates  /v1/artifacts  /v1/audit  ...  │
                    │  /v1/network/links    (M2M, app service key)│
                    │  /v1/network/events   (M2M, app service key)│
                    │  /v1/network/resolve  (M2M, app service key)│
                    │           │                                 │
                    │   DB (existing CI/CD)  NETWORK_DB (new)     │
                    └──────────────────────────────────────────┘
                               ▲              ▲
               HTTPS M2M       │              │  HTTPS M2M
               service key     │              │  service key
                               │              │
              ┌────────────────┴──┐    ┌──────┴──────────────┐
              │    selfprime      │    │     capricast        │
              │  (prime-self-api) │    │   (OAuth2 IdP ✓)    │
              │                   │    │                       │
              │ account_links ────┼───▶│  /oauth/authorize    │
              │ (primary store)   │    │  /oauth/token        │
              │                   │    │  /oauth/userinfo     │
              └───────────────────┘    └──────────────────────┘
                         ▲                      ▲
                  OAuth flow              OAuth IdP
                  (user-facing)           (already live)
```

### 4.2 Identity layer

selfprime's `account_links` table is the primary source of truth for the selfprime↔capricast identity link. After OAuth completes, selfprime:
1. Upserts `account_links` (existing, unchanged)
2. Fire-and-forget: `POST /v1/network/links` to factory-core-api (new — one line in the callback handler)

factory-core-api mirrors the verified link into `factory_network_links`. No app reads the network DB directly — all access via factory-core-api HTTP.

### 4.3 Event bus

Events are immutable facts posted fire-and-forget from app hot paths. Never commands. Never blocking user responses.

```
User action in selfprime
  → ctx.waitUntil(
      fetch('https://network.latwoodtech.work/v1/network/events', {
        method: 'POST',
        headers: { Authorization: 'Bearer <FACTORY_NETWORK_TOKEN>' },
        body: JSON.stringify({ user_id, event: 'reading_generated', properties, schema_version: 1 }),
        signal: AbortSignal.timeout(5_000),
      }).catch(() => {})  // drop silently — never propagate to user
    )
  → factory-core-api validates token → INSERT factory_network_events
  → Platform Brain reads factory_network_events on next hourly cycle
  → network-sense.mjs populates graph.network → synergize scanner fires
```

### 4.4 Signal relay (Phase 5 — future)

When selfprime fires a signal, factory-core-api looks up the user's linked capricast account and calls `POST /api/internal/signal` on the capricast worker. Each app implements `/api/internal/signal` accepting `X-Factory-Signal-Key`. Not built until Phase 5.

---

## 5. Data Model (network Neon project — NETWORK_DB)

### `factory_network_links`

```sql
CREATE TABLE factory_network_links (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_app      TEXT NOT NULL,
  source_user_id  TEXT NOT NULL,
  target_app      TEXT NOT NULL,
  target_user_id  TEXT NOT NULL,
  verified_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_app, source_user_id, target_app)
);
CREATE INDEX idx_fnl_source ON factory_network_links (source_app, source_user_id);
CREATE INDEX idx_fnl_target ON factory_network_links (target_app, target_user_id);
```

### `factory_network_events`

```sql
CREATE TABLE factory_network_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id          TEXT NOT NULL,
  user_id_local   TEXT NOT NULL,
  event_name      TEXT NOT NULL,
  properties      JSONB NOT NULL DEFAULT '{}',
  schema_version  SMALLINT NOT NULL DEFAULT 1,
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_fne_app_time ON factory_network_events (app_id, occurred_at DESC);
CREATE INDEX idx_fne_user     ON factory_network_events (app_id, user_id_local);
```

### `factory_app_keys`

```sql
CREATE TABLE factory_app_keys (
  app_id      TEXT PRIMARY KEY,
  key_hash    TEXT NOT NULL,    -- SHA-256 hex of bearer token; never plaintext
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  rotated_at  TIMESTAMPTZ
);
```

Token validation uses Web Crypto (`crypto.subtle.digest('SHA-256', ...)`). No Node `crypto`.

---

## 6. API Surface (`/v1/network/` on factory-core-api)

All routes require `Authorization: Bearer <APP_TOKEN>` validated against `factory_app_keys`. The `app_id` is resolved server-side — apps cannot impersonate each other.

| Route | Purpose | Response |
|---|---|---|
| `POST /v1/network/links` | Register verified cross-app link | 200 `{ok, id}` / 409 (idempotent) |
| `POST /v1/network/events` | Publish network event (fire-and-forget) | 202 always |
| `GET /v1/network/resolve` | Resolve linked identity | 200 link record / 404 |
| `GET /v1/network/events` | Query events (Platform Brain, OIDC-scoped) | 200 `{events, next_cursor}` |

`POST /v1/network/events` always returns 202 — validation failures log and return 202 anyway so no event error ever reaches a user.

`GET /v1/network/events` requires a `network-read` scoped JWT (minted via existing `POST /v1/auth/token` with OIDC). This requires adding `network` to the `AUDIENCE_PATTERN` regex in `src/jwt.ts` (from `(?:gates|artifacts|audit|runs)` → add `|network`).

---

## 7. App Integration Contract

Every app that joins the network implements the same minimal surface.

### 7.1 `lib/network.ts` (copy into each app)

```typescript
// Workers-safe. No Node built-ins. No Buffer.
const NETWORK_URL = (env: { FACTORY_NETWORK_URL?: string }) =>
  env.FACTORY_NETWORK_URL ?? 'https://network.latwoodtech.work';

export function fireNetworkEvent(
  ctx: ExecutionContext,
  env: { FACTORY_NETWORK_TOKEN?: string; FACTORY_NETWORK_URL?: string },
  userId: string,
  event: string,
  properties: Record<string, unknown> = {},
  schemaVersion = 1,
): void {
  if (!env.FACTORY_NETWORK_TOKEN) return; // no-op in dev — env var absent
  ctx.waitUntil(
    fetch(`${NETWORK_URL(env)}/v1/network/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.FACTORY_NETWORK_TOKEN}`,
      },
      signal: AbortSignal.timeout(5_000),
      body: JSON.stringify({ user_id: userId, event, properties, schema_version: schemaVersion }),
    }).catch(() => {}),
  );
}

export function registerNetworkLink(
  ctx: ExecutionContext,
  env: { FACTORY_NETWORK_TOKEN?: string; FACTORY_NETWORK_URL?: string },
  sourceUserId: string,
  targetApp: string,
  targetUserId: string,
): void {
  if (!env.FACTORY_NETWORK_TOKEN) return;
  ctx.waitUntil(
    fetch(`${NETWORK_URL(env)}/v1/network/links`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.FACTORY_NETWORK_TOKEN}`,
      },
      signal: AbortSignal.timeout(5_000),
      body: JSON.stringify({ source_user_id: sourceUserId, target_app: targetApp, target_user_id: targetUserId }),
    }).catch(() => {}),
  );
}
```

**Rollback:** remove `FACTORY_NETWORK_TOKEN` from wrangler secrets → all calls no-op instantly. No code change required.

### 7.2 wrangler.jsonc additions per app

```jsonc
// vars block
"FACTORY_NETWORK_URL": "https://network.latwoodtech.work"
// secrets (wrangler secret put)
// FACTORY_NETWORK_TOKEN — value from GCP SM: <APP>_FACTORY_NETWORK_TOKEN
```

### 7.3 Inbound (Phase 5 — signal endpoint)

```typescript
app.post('/api/internal/signal', async (c) => {
  if (c.req.header('X-Factory-Signal-Key') !== c.env.FACTORY_SIGNAL_KEY) {
    return c.json({ error: 'forbidden' }, 403);
  }
  const { signal, source_app, properties } = await c.req.json<{ signal: string; source_app: string; properties: Record<string, unknown> }>();
  // app-specific handler
  return c.json({ ok: true });
});
```

---

## 8. Security Model

**M2M token pattern** follows factory-core-api's existing service-key precedent (one secret per consumer, route-scoped). One `FACTORY_NETWORK_TOKEN` per app stored as wrangler secret; SHA-256 hash stored in `factory_app_keys`.

**Threat model:**
- App impersonation: impossible — token→app_id mapping is server-side
- Replay: long-lived bearer secrets; rotation via `wrangler secret put`
- Spoofed links: calling app can only poison its own identity mapping (the OAuth callback already validated the link before the app calls `/v1/network/links`)
- Event poisoning: append-only analytics — affects sensing accuracy, not business logic

**Privacy:** `factory_network_links` is PII-adjacent (reveals account co-ownership). factory-core-api is the sole accessor — app-level auth IS the protection layer. No RLS needed. Deletion cascade: not required today (zero users). Add when first user joins.

---

## 9. Platform Brain Integration

### 9.1 `scripts/network-sense.mjs` (new — runs in generate-founder-stats.yml)

Reads `GET /v1/network/events` (OIDC-scoped token) and writes a `network` block into `entity-graph.json`:

```json
{
  "network": {
    "link_rate": 0.02,
    "capricast_links_total": 4,
    "selfprime_readings_7d": 180,
    "cross_app_funnel": 3,
    "as_of": "2026-06-08T..."
  }
}
```

The `cross-app-network-gap` scanner in `opportunity-scan.mjs` reads `graph.network` and routes observations to the weekly brief. The `missing-network-token` scanner reads `app.networkTokenConfigured` (a field added to entity-graph nodes from service-registry data — `null` means not configured → auto-file ticket).

### 9.2 Planning brief

`planning-session.mjs` gains a `## Cross-App Network` section when `graph.network` is populated with non-null values. This is the weekly human-readable view of the synergize scan output.

### 9.3 Platform Brain Phase 5 (LEARN) dependency

The LEARN phase cannot close the attribution loop without cross-app event data. **Deploying Phases 0–1 of this plan is the prerequisite for Platform Brain Phase 5.** Once `factory_network_events` accumulates 30+ days of data, the trend-analyzer gains cross-app funnel metrics to attribute outcomes against.

---

## 10. Build Phases

### Phase 0 — Foundation: factory-core-api network surface (Week 1)

**Goal:** `network.latwoodtech.work` accepts links and events. No app changes yet.

1. **Provision network Neon project.** Use the spare `factory_core` project. Mint Hyperdrive config pointing at it — add as `NETWORK_DB` binding in factory-core-api `wrangler.jsonc`.

2. **Apply migration.** `apps/factory-core-api/migrations/0001_network.sql` — creates `factory_network_links`, `factory_network_events`, `factory_app_keys`. Add a minimal migration runner to factory-core-api (same pattern as selfprime's `src/db/migrate.js`); hook it into the deploy workflow before `wrangler deploy`.

3. **`src/lib/app-auth.ts`** — `validateAppToken(token, db): Promise<string | null>`. Web Crypto SHA-256, compares to `factory_app_keys.key_hash`. Returns `app_id` or `null`.

4. **`src/routes/network.ts`** — `POST /v1/network/links`, `POST /v1/network/events`, `GET /v1/network/resolve`, `GET /v1/network/events` (OIDC-scoped). Mount at `app.route('/v1/network', createNetworkRouter())`.

5. **`src/jwt.ts`** — update `AUDIENCE_PATTERN` to `/^(?:gates|artifacts|audit|runs|network)-[a-z0-9-]{1,40}$/u`.

6. **`wrangler.jsonc`** — add `network.latwoodtech.work` route + `NETWORK_DB` hyperdrive binding + `[env.production]` mirror of both.

7. **Seed `factory_app_keys`.** Generate tokens for selfprime + capricast. Store plaintext in GCP SM as `SELFPRIME_FACTORY_NETWORK_TOKEN` + `CAPRICAST_FACTORY_NETWORK_TOKEN`. Insert SHA-256 hashes into DB.

8. **Attach `network.latwoodtech.work` DNS.** AAAA `100::` proxied in `latwoodtech.work` CF zone. Redeploy.

9. **Verify:**
   - `curl https://network.latwoodtech.work/health` → 200
   - `POST /v1/network/events` with valid token → 202
   - `POST /v1/network/events` with bad token → 401
   - `GET /v1/network/resolve?source_app=selfprime&source_user_id=x&target_app=capricast` → 404 (empty DB — correct)

---

### Phase 1 — Pilot: wire selfprime + capricast backend (Week 2)

**Goal:** both apps emit events; selfprime registers links after OAuth.

**selfprime:**
1. Add `workers/src/lib/network.js` (JS not TS — selfprime is JS workers).
2. Add `FACTORY_NETWORK_URL` to wrangler.jsonc vars; `FACTORY_NETWORK_TOKEN` via wrangler secret.
3. In `handleOAuthCallback` (account-link-oauth.js), after `upsertVerifiedAccountLink`:
   ```javascript
   registerNetworkLink(ctx, env, userId, 'capricast', String(externalId));
   ```
4. Fire events per `docs/registry/network-events.yml` selfprime entries.

**capricast:**
1. Add `apps/worker/src/lib/network.ts`.
2. Add `FACTORY_NETWORK_URL` var + `FACTORY_NETWORK_TOKEN` secret.
3. Fire `video_published` from `POST /api/admin/videos/import` handler (the sync point where capricast first knows the video is live — not from GitHub Actions).
4. Fire `channel_created`, `subscriber_added`, `conference_started` from their respective handlers.

**Verify:**
- Complete a selfprime reading as test user → `SELECT * FROM factory_network_events WHERE app_id='selfprime'` in network DB → row appears
- Complete capricast OAuth link in selfprime settings → `SELECT * FROM factory_network_links` → row appears
- Import a video in capricast → `video_published` event row in network DB

---

### Phase 2 — Link Prompt UX (Week 3)

**Goal:** surface the account link CTA at natural moments. Adoption populates `factory_network_links` — without it the event chain is empty.

**Primary surface: capricast creator dashboard**
Creators who want to *be discovered* by selfprime users are more motivated to link than selfprime users who've never heard of capricast. A creator with a public channel sees:
> *"Surface your Design — connect your selfprime profile to let seekers find your channel by type."*  
Button: "Connect selfprime" → deep-links to `https://selfprime.net/api/account-link/capricast/oauth/start`

**Secondary surface: selfprime post-reading**
After a HD reading generates, for users without a linked capricast account:
> *"Share your Design on Capricast — link your account to let your community find your channel."*  
Button: "Connect Capricast" → `/api/account-link/capricast/oauth/start`  
Dismiss stores flag in localStorage (zero DB cost). If user has no capricast account, the OAuth flow redirects to capricast login → account creation → back to the link flow.

**Settings:** both apps show link status in account settings (Connected/Connect button).

**Measurement:** `account_linked` events in `factory_network_events` per week is the primary adoption KPI for the network layer.

---

### Phase 3 — Platform Brain integration (Week 3, parallel)

**Goal:** Platform Brain reads cross-app metrics; synergize scan fires.

1. **`scripts/network-sense.mjs`** — queries `GET /v1/network/events` with OIDC-scoped `network-read` token (mint via existing `POST /v1/auth/token` exchange in the GHA workflow). Writes `graph.network` block into entity-graph.json.

2. **Wire into `generate-founder-stats.yml`** — add step after `trend-analyzer.mjs`:
   ```yaml
   - name: Network sense (Platform Brain synergize)
     env:
       GH_TOKEN: ${{ steps.app-token.outputs.token }}
       OIDC_TOKEN: ${{ steps.oidc.outputs.token }}
     run: node scripts/network-sense.mjs
   ```

3. **`planning-session.mjs`** — add `## Cross-App Network` section when `graph.network` is populated.

4. **Entity graph node:** add `networkTokenConfigured: boolean` to app nodes in `build-entity-graph.mjs` — derived from service-registry.yml checking for `FACTORY_NETWORK_TOKEN` in the app's known secrets. `missing-network-token` scanner reads this field.

**Verify:** run opportunity-scan in dry-run mode → `cross-app-network-gap` proposals appear in output (empty `graph.network` → missing data → brief-path). `missing-network-token` → tickets proposed for coh + xico-city (not yet wired).

---

### Phase 4 — coh (Week 4)

**Goal:** coh joins as an OAuth consumer (capricast as IdP). Platform integration exemption applies — mode is `maintain` but the exemption covers network integration.

1. Add `lib/network.ts` + `FACTORY_NETWORK_URL` + `FACTORY_NETWORK_TOKEN` secret.
2. Wire capricast OAuth consumer in coh worker (same pattern as selfprime's `account-link-oauth.js`).
3. Seed `factory_app_keys` with coh token (`COH_FACTORY_NETWORK_TOKEN` in GCP SM).
4. Fire `blueprint_generated` event.
5. Update `networkTokenConfigured: true` for coh in entity-graph — `missing-network-token` deduplication suppresses the auto-file ticket.

**Note on coh-as-capricast-consumer:** capricast is the IdP. coh users who link their capricast account are linked transitively to selfprime via `factory_network_links` (coh→capricast + selfprime→capricast = three-way graph). factory-core-api's `/v1/network/resolve` can traverse this. selfprime-as-IdP is deferred to Phase 5.

---

### Phase 5 — Runtime signals + selfprime as IdP (Week 5–6)

1. **Selfprime as OAuth2 IdP** — port capricast's `oauth-provider.ts` into selfprime worker. Stateless JWT, same Web Crypto pattern. coh and future apps can then link selfprime accounts directly, removing the capricast SPOF.

2. **Signal relay** — `POST /v1/network/signals` on factory-core-api. Looks up `factory_network_links` for target, calls `POST /api/internal/signal` on the target worker (URL registered in `factory_app_keys` via a new `worker_url` column). Each app implements `/api/internal/signal` with `X-Factory-Signal-Key` validation.

3. **First signals wired:**
   - selfprime `reading_generated` → capricast signal (surface "potential viewer just completed a reading")
   - capricast `video_published` → selfprime signal (notify linked user "your channel published")

---

### Phase 6 — xico-city + Platform Brain LEARN (Week 7+)

xico-city follows the same contract as coh (Phase 4 pattern). Events: `course_started`, `module_completed`.

Platform Brain LEARN: 30+ days of `factory_network_events` data enables the trend-analyzer to attribute cross-app funnel outcomes to specific opportunities. The LEARN loop closes.

---

## 11. Schema Enforcement (Platform Standard §12)

**`scripts/check-network-events.mjs`** — added in Phase 0 alongside the routes, runs in CI:
- Reads `docs/registry/network-events.yml` — the canonical event registry
- Greps app source for `fireNetworkEvent` calls
- Validates: event names appear in registry; `schema_version` is specified; no PII-shaped properties (email regex, name patterns)
- Fails CI on violation

This makes the event taxonomy machine-enforceable, not just convention. The same CI gate catches schema drift before it reaches the Platform Brain's LEARN inputs.

---

## 12. ADR: factory-core-api scope expansion

**Decision (2026-06-08):** factory-core-api expands from "CI/CD ingestion + auth API" to "Factory platform infrastructure API." The network surface (`/v1/network/*` at `network.latwoodtech.work`) is the first addition beyond CI/CD scope.

**Rationale:** factory-core-api is the correct owner for platform-level infrastructure because it is not a product (cannot be transferred, has no user-facing surface, is operator-controlled). The lessons-learned doc anticipated this: the `factory_core` Neon project slot was always reserved for cross-app aggregation.

**Consequences:** factory-core-api's service description in `docs/service-registry.yml` should be updated to "Factory platform infrastructure API — CI/CD auth, ingestion, network graph, event bus." Its `strategicWeight` in `objectives.yml` may warrant a bump given its expanded role.

---

## 13. Non-Goals

- **SSO / shared login** — separate accounts per app; linking is opt-in
- **Shared user database** — each app retains its own Neon project
- **Real-time event streaming** — Platform Brain polls hourly; Queues/WS deferred to Phase 5 signals only
- **Cross-app profile PII sync** — events carry UUIDs and anonymized fields only
- **factory_user_id as global identifier** — per-app IDs joined via `factory_network_links` is sufficient

---

## 14. Verification Checklist

- [ ] `network.latwoodtech.work/health` → 200
- [ ] `factory_network_links` exists in NETWORK_DB; at least one verified selfprime→capricast row after Phase 1
- [ ] `factory_network_events` populating from selfprime and capricast within 24h of Phase 1 deploy
- [ ] `GET /v1/network/resolve?source_app=selfprime&source_user_id=X&target_app=capricast` returns the capricast ID
- [ ] `graph.network` block appears in entity-graph.json after next Platform Brain cycle
- [ ] `cross-app-network-gap` observable in opportunity-scan dry-run output
- [ ] `missing-network-token` tickets auto-filed for unwired apps
- [ ] Post-reading link CTA visible in selfprime for unlinked users; hidden for linked users
- [ ] Event fire adds no measurable p95 latency (Sentry before/after comparison)
- [ ] `POST /v1/network/events` with wrong token → 401, never 5xx
- [ ] `check-network-events.mjs` passes CI against current app event fires

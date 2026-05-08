# Entitlements v0.2 Implementation — Feature Tiers & Access Control

**Status:** In Flight (SUP-2.3)  
**Target completion:** 2026-05-22  
**Scope:** Implement feature entitlements system across 6 production apps

---

## Mission

Unify feature access control across Factory apps. Replace per-app subscription tier checks with a typed, reusable entitlements system backed by Neon (D1 fallback) via the `@latimer-woods-tech/entitlements` package.

**Who needs this?**
- selfprime.net: Individual / Practitioner / Agency tiers → unlocks different LLM credit budgets, template access, white-label scope
- capricast.com (videoking): Free / Creator / Studio tiers → video limits, social integration, analytics depth
- xicocity.com (xico-city): Artist / Label / Distributor tiers → upload limits, commission control, analytics

---

## Architecture

### 1. Schema (D1)

```sql
-- Entitlements: the feature flags catalog (immutable, operator-maintained)
CREATE TABLE entitlements (
  id TEXT PRIMARY KEY,           -- e.g. "feature:video-upload", "tier:practitioner"
  label TEXT NOT NULL UNIQUE,    -- human-readable: "Video Upload", "Practitioner Tier"
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- User Entitlements: which features/tiers each user has (mutable via /admin)
CREATE TABLE user_entitlements (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,         -- app-specific identifier (selfprime user, capricast user, etc.)
  entitlement_id TEXT NOT NULL,  -- foreign key to entitlements.id
  granted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NULL,     -- NULL = never expires
  app_scope TEXT NOT NULL,       -- "selfprime", "videoking", "xico-city" (to allow multi-tenant reuse)
  UNIQUE (user_id, entitlement_id, app_scope),
  FOREIGN KEY (entitlement_id) REFERENCES entitlements(id)
);

CREATE INDEX idx_user_entitlements_user_id ON user_entitlements(user_id, app_scope);
CREATE INDEX idx_user_entitlements_expires ON user_entitlements(expires_at);
```

### 2. Package: `@latimer-woods-tech/entitlements`

**Status:** Already scaffolded at v0.1.0

**API (unchanged):**
```typescript
export async function canAccess(
  store: EntitlementStore,
  userId: string,
  featureId: string,
): Promise<boolean>;

export async function getEntitlements(
  store: EntitlementStore,
  userId: string,
): Promise<Entitlement[]>;
```

**Implementation:** Each app creates its own `EntitlementStore` wrapper over D1:

```typescript
// In each app (e.g. apps/selfprime/src/lib/entitlements.ts)
import { canAccess, getEntitlements } from '@latimer-woods-tech/entitlements';

export const entitlementStore: EntitlementStore = {
  async getForUser(userId: string) {
    const rows = await env.DB.prepare(
      `SELECT e.id, e.label, ue.expires_at
       FROM entitlements e
       JOIN user_entitlements ue ON e.id = ue.entitlement_id
       WHERE ue.user_id = ? AND ue.app_scope = ? AND ue.expires_at IS NULL OR ue.expires_at > NOW()`,
    )
      .bind(userId, 'selfprime')
      .all();
    
    return rows.map(r => ({
      id: r.id,
      label: r.label,
      enabled: true,
      expiresAt: r.expires_at,
    }));
  },
};

// Then use it:
if (await canAccess(entitlementStore, userId, 'feature:video-upload')) {
  // user can upload
}
```

### 3. Admin Control Plane

**Location:** `/admin/entitlements` (mounted by `@latimer-woods-tech/admin` package)

**Features:**
- List users and their current entitlements
- Grant/revoke entitlements
- Set expiry dates
- Bulk operations (CSV import)
- Audit log of all changes

**Implementation:** Hono router in admin package

```typescript
// packages/admin/src/entitlements-routes.ts
export const entitlementsRouter = new Hono<{ Bindings: AdminEnv }>();

entitlementsRouter.get('/users/:userId', async (c) => {
  // Get user's entitlements
  const ents = await getEntitlements(store, c.req.param('userId'));
  return c.json(ents);
});

entitlementsRouter.post('/users/:userId/grant', async (c) => {
  // Grant entitlement with optional expiry
  const { entitlementId, expiresAt } = await c.req.json();
  const userId = c.req.param('userId');
  
  await env.DB.prepare(
    `INSERT INTO user_entitlements (id, user_id, entitlement_id, app_scope, expires_at)
     VALUES (?, ?, ?, ?, ?)`
  )
    .bind(crypto.randomUUID(), userId, entitlementId, appScope, expiresAt || null)
    .run();
  
  return c.json({ ok: true });
});
```

---

## Per-App Integration

### Template: selfprime.net (Practitioner Sync)

**Feature set:**
- `tier:individual` → 100 credits/month, no templates
- `tier:practitioner` → 1000 credits/month, custom templates, white-label
- `tier:agency` → unlimited credits, team workspace, api access

**Integration points:**
1. Auth middleware: After JWT verify, check `canAccess(store, userId, 'tier:practitioner')`
2. LLM credit deduction: Query entitlements to get tier-based budget
3. Admin dashboard: Use `/admin/entitlements` to manage tier grants
4. Stripe webhook: On subscription upgrade, grant new tier entitlement + expire old one

**Files to touch:**
- `src/middleware/auth.ts` → add entitlements check
- `src/routes/admin.ts` → mount entitlements router
- `src/lib/llm-budget.ts` → use entitlements to determine credit limit
- `src/index.ts` → import + initialize entitlementStore

### Template: videoking/capricast.com (Creator Tier Sync)

**Feature set:**
- `tier:free` → 5 videos/month
- `tier:creator` → 50 videos/month, social integration
- `tier:studio` → unlimited, advanced analytics

**Same integration pattern as selfprime.**

### Template: xico-city.com (Artist Access Sync)

**Feature set:**
- `role:artist` → upload limits, commission control
- `role:label` → team management, batch uploads
- `role:distributor` → api access, bulk metadata

**Same integration pattern.**

---

## Rollout Sequence

### Phase 1: Database & Admin (Week 1)
- Create D1 schema in all 3 app Neon projects
- Run Drizzle migration
- Implement admin routes in `@latimer-woods-tech/admin`
- Deploy to staging

### Phase 2: Selfprime Integration (Week 2)
- Add entitlementStore to selfprime
- Wire auth middleware
- Wire LLM budget logic
- Add Stripe webhook handler
- Test: grant practitioner tier → verify LLM budget increases
- Deploy to canary, then prod

### Phase 3: Videoking Integration (Week 3)
- Same pattern as selfprime
- Verify video limits enforce correctly
- Deploy to prod

### Phase 4: Xico-City Integration (Week 4)
- Same pattern
- Deploy to prod

### Phase 5: Polish & Observability (Week 5)
- Add Sentry hooks for entitlement checks
- Add PostHog events for tier changes
- Audit log retention policy
- Documentation + runbook

---

## Acceptance Criteria

- [ ] D1 schema deployed to all 3 apps
- [ ] Entitlements admin UI functional and tested
- [ ] Selfprime: tier grants correctly limit LLM credits
- [ ] Videoking: tier grants correctly limit video uploads
- [ ] Xico-City: role grants correctly control upload scope
- [ ] Stripe webhooks update entitlements on subscription events
- [ ] Entitlements expire correctly (no access after expiresAt)
- [ ] Admin audit log shows all grant/revoke events
- [ ] Sentry metrics track entitlement check latency
- [ ] PostHog funnel: user signup → tier grant → feature usage

---

## Success Metrics

- **Unification**: 0 lines of per-app subscription checking code (all via entitlements)
- **Observability**: Sub-100ms latency on `canAccess()` checks (cached via KV or D1 query plan)
- **Adoption**: 3/3 apps using entitlements by 2026-05-22
- **Operational**: Admin can grant/revoke tier in <30 seconds via UI

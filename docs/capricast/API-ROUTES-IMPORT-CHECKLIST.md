# API Routes Import Checklist

**Purpose:** Track import statements needed to make all routes compile in TypeScript strict mode

**Status:** 🔴 BLOCKED — Routes created but need Drizzle schema imports

---

## Route Files Created

| File | Endpoints | Drizzle Tables Needed | Status |
|------|-----------|----------------------|--------|
| creator-onboarding.ts | 5 | creatorConnections | 🔴 Imports missing |
| creators.ts | 3 | creatorConnections, creators | 🔴 Imports missing |
| payouts.ts | 8 | payoutBatches, payouts, payoutDlq, payoutAuditLog, creators, creatorConnections | 🔴 Imports missing |
| webhooks-stripe-connect.ts | 1 | creatorConnections | 🔴 Imports missing |

---

## Import Statements Needed

### creator-onboarding.ts

```typescript
// From @latimer-woods-tech/neon or local schema
import { creatorConnections, creators } from '../schema/drizzle.ts';

// HTTP utilities
import { Hono } from 'hono';
import { jwt } from 'hono/jwt';

// Factory packages
import { 
  createDb, 
  type HyperdriveDatabaseConfig 
} from '@latimer-woods-tech/neon';
import { createStripeClient } from '@latimer-woods-tech/stripe';
import { 
  ValidationError, 
  StripeError, 
  type ErrorResponse 
} from '@latimer-woods-tech/errors';
import { track } from '@latimer-woods-tech/analytics';
import { logger } from '@latimer-woods-tech/logger';

// Database query utilities
import { eq, and, desc, like, gte } from 'drizzle-orm';
```

### creators.ts

```typescript
import { creatorConnections, creators, payoutBatches } from '../schema/drizzle.ts';
import { Hono } from 'hono';
import { createDb, type HyperdriveDatabaseConfig } from '@latimer-woods-tech/neon';
import { createStripeClient } from '@latimer-woods-tech/stripe';
import { ValidationError, type ErrorResponse } from '@latimer-woods-tech/errors';
import { track } from '@latimer-woods-tech/analytics';
import { logger } from '@latimer-woods-tech/logger';
import { eq, desc, and, like, gt, gte, lte } from 'drizzle-orm';
import { asc, sql } from 'drizzle-orm';
```

### payouts.ts

```typescript
import { 
  payoutBatches, 
  payouts, 
  payoutDlq, 
  payoutAuditLog, 
  creatorConnections, 
  creators 
} from '../schema/drizzle.ts';
import { Hono } from 'hono';
import { createDb, type HyperdriveDatabaseConfig } from '@latimer-woods-tech/neon';
import { createStripeClient } from '@latimer-woods-tech/stripe';
import { ValidationError, type ErrorResponse, DatabaseError } from '@latimer-woods-tech/errors';
import { track } from '@latimer-woods-tech/analytics';
import { logger } from '@latimer-woods-tech/logger';
import { eq, desc, and, or, like, gt, gte, lt, lte, isNull } from 'drizzle-orm';
import { sql, count, sum } from 'drizzle-orm';
```

### webhooks-stripe-connect.ts

```typescript
import { creatorConnections } from '../schema/drizzle.ts';
import { Hono } from 'hono';
import { createDb, type HyperdriveDatabaseConfig } from '@latimer-woods-tech/neon';
import { createStripeClient } from '@latimer-woods-tech/stripe';
import { ValidationError, type ErrorResponse } from '@latimer-woods-tech/errors';
import { track } from '@latimer-woods-tech/analytics';
import { logger } from '@latimer-woods-tech/logger';
import { eq } from 'drizzle-orm';
```

---

## Table Schema Definitions Needed

Before imports will compile, verify these Drizzle schemas exist:

### creators table

```typescript
export const creators = pgTable('creators', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  email: text('email').notNull(),
  firstName: text('first_name'),
  lastName: text('last_name'),
  stripeConnectId: text('stripe_connect_id').unique(),
  createdAt: timestamp('created_at').defaultNow(),
});
```

### creatorConnections table

```typescript
export const creatorConnections = pgTable('creator_connections', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  creatorId: uuid('creator_id').references(() => creators.id),
  stripeAccountId: text('stripe_account_id').unique(),
  onboardingStatus: text('onboarding_status').default('pending'),
  submittedAt: timestamp('submitted_at'),
  verifiedAt: timestamp('verified_at'),
  errorMessage: text('error_message'),
  lastVerificationAttempt: timestamp('last_verification_attempt'),
  verificationAttempts: integer('verification_attempts').default(0),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});
```

### payoutBatches table

```typescript
export const payoutBatches = pgTable('payout_batches', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  periodDate: date('period_date').notNull(),
  status: text('status').default('pending'), // pending, processing, completed, partial, failed
  creatorCount: integer('creator_count'),
  totalAmountUsd: numeric('total_amount_usd', { precision: 12, scale: 2 }),
  succeededCount: integer('succeeded_count').default(0),
  failedCount: integer('failed_count').default(0),
  createdBy: uuid('created_by').references(() => creators.id),
  lastOperatorAction: text('last_operator_action'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});
```

### payouts table

```typescript
export const payouts = pgTable('payouts', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  batchId: uuid('batch_id').references(() => payoutBatches.id),
  creatorId: uuid('creator_id').references(() => creators.id),
  amountUsd: numeric('amount_usd', { precision: 12, scale: 2 }),
  status: text('status').default('pending'), // pending, succeeded, failed, retry
  error: text('error'),
  retryCount: integer('retry_count').default(0),
  stripeTransferId: text('stripe_transfer_id').unique(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});
```

### payoutDlq table (Dead Letter Queue)

```typescript
export const payoutDlq = pgTable('payout_dlq', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  payoutId: uuid('payout_id').references(() => payouts.id),
  batchId: uuid('batch_id').references(() => payoutBatches.id),
  creatorId: uuid('creator_id').references(() => creators.id),
  errorReason: text('error_reason').notNull(),
  suggestedAction: text('suggested_action'),
  resolutionStatus: text('resolution_status').default('pending'), // pending, retrying, resolved, archived
  resolvedBy: uuid('resolved_by').references(() => creators.id),
  resolvedAt: timestamp('resolved_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});
```

### payoutAuditLog table

```typescript
export const payoutAuditLog = pgTable('payout_audit_log', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  batchId: uuid('batch_id').references(() => payoutBatches.id),
  operatorId: uuid('operator_id').references(() => creators.id),
  action: text('action').notNull(), // 'batch_created', 'execute_started', 'execute_completed', etc.
  affectedCreatorCount: integer('affected_creator_count'),
  details: jsonb('details'), // JSON with error codes, retry counts, etc.
  createdAt: timestamp('created_at').defaultNow(),
});
```

---

## Type Definitions Needed

### Request/Response Types

```typescript
// creator-onboarding.ts request types
interface StartOnboardingRequest {
  // POST /api/creator/onboarding/start
  // No body needed; uses auth context
}

interface CallbackRequest {
  // GET /api/creator/onboarding/callback?code=...&state=...
  code: string;
  state: string;
}

interface VerifyRequest {
  // PUT /api/creator/onboarding/verify
  confirmReady: boolean;
}

interface ResubmitRequest {
  // POST /api/creator/onboarding/resubmit
  // No body needed; uses auth context
}

// Response types
interface OnboardingStatusResponse {
  status: string;
  stripeConnectId?: string;
  nextAction: string;
  errorMessage?: string;
  lastUpdate: string;
}

interface StripeOAuthResponse {
  authUrl: string;
  state: string;
}
```

---

## Type Issues to Fix

### In creator-onboarding.ts

```typescript
// ❌ Currently:
const user = c.get('user');

// ✅ Should be:
interface AuthContextUser {
  id: string;
  email: string;
  role: 'creator' | 'admin' | 'operator';
}
const user = c.get('user') as AuthContextUser;
```

### In payouts.ts (batch execution streaming)

```typescript
// ❌ Currently streaming progress without proper types
context.header('Content-Type', 'text/event-stream');

// ✅ Should define stream event type:
interface BatchExecutionEvent {
  type: 'progress' | 'completed' | 'error';
  payoutId?: string;
  creatorId?: string;
  status?: string;
  message: string;
  timestamp: string;
}
```

---

## Import Order (Following Factory Standards)

1. **Drizzle tables** — Local schema definitions
2. **Hono framework** — HTTP utilities
3. **Factory packages** — In dependency order (errors → monitoring → logger → auth → neon → stripe)
4. **Database utilities** — Drizzle query builders
5. **Constants & types** — Local types (optional)

---

## Verification Checklist

Before marking routes as "ready":

- [ ] All Drizzle table imports resolve without errors
- [ ] All Factory package imports resolve (`@latimer-woods-tech/...`)
- [ ] TypeScript strict mode: `tsc --strict` passes
- [ ] ESLint: `eslint . --max-warnings 0` passes
- [ ] All middleware (auth, admin check, audit) properly typed
- [ ] All error responses follow `@latimer-woods-tech/errors` format
- [ ] All analytics events have correct event names and params
- [ ] All database queries have proper parameterization (no SQL injection)

---

## Quick Reference: What Drizzle Tables Get Which Routes

| Table | Read | Write | Routes |
|-------|------|-------|--------|
| creators | ✅ | ❌ | All routes (read for auth context) |
| creatorConnections | ✅ | ✅ | creator-onboarding, creators, webhooks |
| payoutBatches | ✅ | ✅ | payouts (all batch operations) |
| payouts | ✅ | ✅ | payouts (individual transfer tracking) |
| payoutDlq | ✅ | ✅ | payouts (DLQ triage + recovery) |
| payoutAuditLog | ❌ | ✅ | All routes (append-only logging) |

---

## Next Action

**Run in terminal:**
```bash
# Check if imports resolve
cd apps/admin-studio
npm run typecheck

# Run ESLint
npm run lint

# If errors, refer to this checklist to fix imports in order
```

**Expected errors if not fixed:**
- `Cannot find module '@latimer-woods-tech/...'`
- `Type 'any' is implicitly 'any'`
- `Object is of type 'unknown'` (auth context not typed)
- `Property 'xyz' does not exist on type 'xyz'` (table schema mismatch)

---

**Prepared by:** Phase C Implementation Agent  
**Date:** April 28, 2026  
**Status:** Ready for import fix-up session

# Money Flow Test Strategy

**VideoKing — Critical Tests for Payment Integrity**

Goal: Monetization defects cost money + trust. This strategy ensures critical money flows stay safe during refactors.

---

## Why This Matters

A single regression in **any** of these flows can cause:
- **Double-charges:** Customer charged twice, transaction logs mismatched
- **Missing earnings:** Creator's payout shows $0 instead of $500
- **Under-pays:** Creator gets $50 instead of $500 (math error in split)
- **Lost transactions:** Payment succeeds in UI but never reaches creator's account (DLQ grows)

**Test coverage prevents ALL of these.** And makes refactors safe.

---

## Test Suite Organization

```
apps/worker/__tests__/
├── payout-flow-regression.test.ts      ← Main suite (20 tests)
├── routes-payments.integration.test.ts ← Real server (12 tests)
└── observability-flow.test.ts          ← Tracing (3 tests)

Coverage target: 95% for:
  - src/services/payout-service.ts
  - src/services/stripe-connect.ts
  - src/lib/dead-letter-queue.ts
```

---

## Run Tests Locally

```bash
# Install dependencies
npm ci

# Unit tests only (fast, ~5s)
npm run test:money-flow

# With coverage report
npm run test:money-flow -- --coverage

# Integration tests (requires test DB)
npm run test:integration

# All money flow tests (unit + integration)
npm run test:money-flow:full
```

---

## Test Structure

### Flow 1: Subscription Checkout → Charge → Earnings

**Why:** 40% of revenue. If broken, creators don't get paid.

**Tests:**
1. ✅ **Happy path** — Checkout → webhook → earnings recorded (1 test)
2. ✅ **Duplicate webhook** — Received twice, earnings recorded once (idempotency)
3. ✅ **Payment failed** — Charge fails, no earnings created
4. ✅ **Race condition** — Webhook arrives before subscription record, retries
5. ✅ **Stripe Connect incomplete** — Queued to DLQ for manual retry
6. ✅ **Network timeout** — Webhook timeout, event survives in DLQ

**Coverage:** `subscription-checkout.ts`, `webhook-handler.ts`, `earnings-service.ts`

**Run individual test:**
```bash
npm run test:money-flow -- --grep "Subscription Checkout"
```

---

### Flow 2: Unlock Purchase → Access Grant → Earnings

**Why:** PPV/unlocks are high-margin. Math errors here are expensive.

**Tests:**
1. ✅ **Happy path** — Purchase → charge → earnings attributed (1 test)
2. ✅ **Charge fails** — No access granted until paid
3. ✅ **Multiple purchases** — Same user can buy same unlock multiple times
4. ✅ **Refund issued** — Earnings reduced by refund amount
5. ✅ **Quota exceeded** — Creator has rate limit on unlocks per day
6. ✅ **Creator deleted** — Earnings still attributed to archive

**Coverage:** `unlock-service.ts`, `access-control.ts`, `charge-handler.ts`

**Run individual test:**
```bash
npm run test:money-flow -- --grep "Unlock Purchase"
```

---

### Flow 3: Payout Batch → Snapshot → Execute → Transfer

**Why:** Batching ensures no double-pays and handles partial failures gracefully.

**Tests:**
1. ✅ **Happy path** — Batch created, snapshotted, transfers execute (1 test)
2. ✅ **Partial failure** — Some transfers fail, go to DLQ, others succeed
3. ✅ **Interrupted execution** — Mid-way interrupt rolls back to pending state
4. ✅ **No earnings** — Empty batch creation rejected
5. ✅ **Account disabled mid-batch** — Account disabled after snapshot but before transfer
6. ✅ **Duplicate batch** — Second batch for same period is rejected

**Coverage:** `payout-service.ts`, `stripe-transfer.ts`, `batch-snapshot.ts`

**Run individual test:**
```bash
npm run test:money-flow -- --grep "Payout Batch"
```

---

### Flow 4: DLQ Event → Retry → New Batch

**Why:** Failed transactions must retry safely. DLQ is the safety net.

**Tests:**
1. ✅ **Happy path retry** — Event retried after operator fix (1 test)
2. ✅ **Max retries exceeded** — Event moved to permanent failure
3. ✅ **Malformed webhook** — Operator can review and re-submit
4. ✅ **Concurrent retry** — Two retries prevent duplicate processing
5. ✅ **New batch includes DLQ retry** — Failed earnings included in next batch
6. ✅ **DLQ retention** — 30+ day events auto-archived

**Coverage:** `dead-letter-queue.ts`, `dlq-retry.ts`, `batch-creation.ts`

**Run individual test:**
```bash
npm run test:money-flow -- --grep "DLQ Event"
```

---

## Integration Tests

These run against real server + test database.

```bash
npm run test:integration -- routes-payments.integration.test.ts
```

**Coverage:**
- ✅ POST `/api/payment/checkout` returns valid Stripe session
- ✅ POST `/webhooks/stripe` creates earnings and notifies creator
- ✅ POST `/api/admin/payouts/batch` snapshots earnings transactionally
- ✅ POST `/api/admin/payouts/batch/:id/execute` attempts transfers
- ✅ Failed transfers appear in DLQ after 5s
- ✅ `/admin/dlq/{id}/retry` successfully retries events

---

## Observability Tests

Verify correlationId flows through entire system.

```bash
npm run test:money-flow -- --grep "observability"
```

**Tests:**
- ✅ correlationId in logs from frontend action → worker → database
- ✅ correlationId appears in Sentry events
- ✅ DLQ events include correlationId for root cause tracing
- ✅ GET `/admin/trace/{correlationId}` retrieves full request history

---

## Adding New Test Cases

### Example: "What if creator's bank account gets frozen mid-payout?"

1. **Understand the flow:**
   - Payout batch executes
   - Stripe transfer succeeds BUT bank rejects (account frozen)
   - Recovery: Transfer shows as "pending" in Stripe, then settles days later

2. **Write test:**

```typescript
it('Edge case: Bank rejects transfer → Stripe retries auto', async () => {
  const creator = createMockCreator({
    stripeConnectId: 'acct_frozen_bank',
  });
  seedData = await seedDatabase(db, { creators: [creator] });

  // Simulate bank freeze (Stripe will retry)
  const batchResponse = await POST('/api/admin/payouts/batch', {});
  const batchId = batchResponse.body.batchId;

  const executeResponse = await POST(
    `/api/admin/payouts/batch/${batchId}/execute`,
    {},
  );

  // Transfer is initiated but pending
  expect(executeResponse.body.transfersInitiated).toBe(1);
  expect(executeResponse.body.transfersPending).toBe(1);

  // DLQ should NOT have event (Stripe will handle retry)
  // Only if Stripe gives up after 7 days
  await assertDatabaseState(db, {
    dlqEventCount: 0,
  });

  // Verify: Check Stripe transfers after 48 hours (would update to succeeded)
});
```

3. **Update this: Add edge case to above list:** "Bank rejects"
4. **Run full suite:** `npm run test:money-flow -- --coverage`
5. **Ensure 95%+ coverage maintained**

---

## CI/CD Integration

**GitHub Actions** enforces 95% minimum coverage:

```yaml
# .github/workflows/test-money-flow.yml
- name: Money Flow Tests
  run: |
    npm run test:money-flow -- --coverage
    if [ $(cat coverage/lines.txt) -lt 95 ]; then
      echo "Coverage below 95%"
      exit 1
    fi
```

**Result:** Merge blocked if any money flow code drops below 95% coverage.

---

## Test Fixtures (from @latimer-woods-tech/testing)

All tests use realistic mock data:

```typescript
import {
  createMockStripeWebhook,
  createMockCreator,
  createMockEarnings,
  seedDatabase,
  cleanupAfterTest,
  assertDatabaseState,
} from '@latimer-woods-tech/testing';

// Creates realistic Stripe webhook:
const webhook = createMockStripeWebhook('invoice.paid', {
  customerId: 'cus_abc123',
  amount: 999, // $9.99
  metadata: { creator_id: 'creator_123' },
});

// Creates creator with subscription status:
const creator = createMockCreator({
  subscriptionStatus: 'active',
  earningsBalance: 500, // $5.00
});

// Creates earnings record:
const earnings = createMockEarnings('creator_123', 999, {
  status: 'pending',
});

// Seeds database and returns IDs for cleanup:
seedData = await seedDatabase(db, {
  creators: [creator],
  earnings: [earnings],
});

// Assert state after operation:
await assertDatabaseState(db, {
  creatorId: creator.id,
  expectedEarnings: 699, // 70% of $9.99
  expectedSubscribers: 1,
  dlqEventCount: 0,
});

// Cleanup after test:
await cleanupAfterTest(db, seedData);
```

---

## Debugging Failed Tests

### Test: "Payout Batch Edge case 2: Partial transfer failure"

**If fails:**

```
Error: Expected transfersFailed: 1, got 0
```

**Diagnosis:**

1. Check one creator actually has disabled Stripe account (mock):
   ```typescript
   const creators = [
     createMockCreator({ stripeConnectId: 'acct_valid' }),
     createMockCreator({ stripeConnectId: 'acct_disabled' }), // ← This one
   ];
   ```

2. Verify transfer attempt actually calls Stripe API:
   ```typescript
   // In test setup, mock Stripe to reject acct_disabled:
   mockStripeTransfer.mockImplementation(
     (creatorId, amount, account) => {
       if (account === 'acct_disabled') {
         throw new Error('Account not found');
       }
       return { transferId: 'tr_success' };
     },
   );
   ```

3. Verify DLQ queuing:
   ```typescript
   // After execute, check DLQ:
   const dlqEvent = await db
     .select()
     .from(dlqTable)
     .where((d) => d.creatorId === 'creator_disabled')
     .executeTakeFirst();

   expect(dlqEvent).toBeDefined();
   console.log('DLQ event:', dlqEvent); // Debug output
   ```

4. Run with verbose output:
   ```bash
   npm run test:money-flow -- --grep "Partial transfer" --reporter=verbose
   ```

---

## Coverage Report

After running tests, check `coverage/report.html`:

```bash
npm run test:money-flow -- --coverage
open coverage/report.html
```

**Look for:**
- Red lines = untested code (below 95%?)
- Yellow lines = partially tested (conditional not exercised)
- Green lines = fully tested ✅

**If coverage below 95%:**

1. Identify untested line:
   ```
   services/payout-service.ts
   Line 87: if (earnings.length === 0) { (✗ red)
   ```

2. Write test to exercise it:
   ```typescript
   it('rejects batch with no earnings', async () => {
     // Intentionally create batch with no earnings
     const response = await POST('/api/admin/payouts/batch', {});
     expect(response.status).toBe(400);
   });
   ```

3. Re-run coverage: `npm run test:money-flow -- --coverage`

---

## Performance Baseline

**Target times (on CI runner):**

- Unit tests (20 tests): <10 seconds ✅
- Unit tests + coverage: <15 seconds ✅
- Integration tests (12 tests): <30 seconds
- Full suite (unit + integration): <45 seconds

If slower:
- Check for unnecessary `await sleep()` in tests
- Optimize database seed (batch inserts vs. one-by-one)
- Use in-memory database (SQLite) for unit tests instead of Neon

---

## Maintenance

### Every release:

```bash
# Before deploying to production:
npm run test:money-flow:full -- --coverage

# Verify 95%+ on all money flow code
# Verify all integration tests pass
# Review any newly added tests
```

### Every quarter:

- Review untested edge cases (comment: "TODO: test when..." in code)
- Add new edge cases discovered in production bugs
- Update fixtures if API signatures change
- Sync with @latimer-woods-tech/testing package updates

### Every production incident:

- Add regression test to prevent recurrence
- Document root cause in test comment
- Increase coverage if incident wasn't caught

---

## Links

- **Fixtures:** [@latimer-woods-tech/testing](../packages/testing/)
- **E2E Tracing:** [Full-Stack Tracing](../observability/full-stack-tracing.md)
- **Incident Debugging:** [Debugging with Correlation IDs](../observability/debugging-with-correlation-ids.md)

---

## Success Criteria

✅ **All 4 flows covered:** checkout, unlock, payout, DLQ  
✅ **20+ edge case tests:** 5+ per flow  
✅ **95%+ coverage** on payout services  
✅ **CI enforces coverage:** Coverage blocks merge if <95%  
✅ **Integration tests pass** locally & in GitHub Actions  
✅ **<5 min to run** full suite on CI  

**Result:** Money flows stay safe. Refactors confidence. Creators get paid.

# Lessons Learned & Common Errors

This document captures recurring errors, patterns, and best practices discovered during Factory Core development. Reviewed quarterly; updated whenever new errors emerge.

## Hard Constraints (Never Violate)

These constraints are enforced by quality gates and prevent silent runtime failures. Violating any of them breaks the CI/CD pipeline or produces mysterious production errors.

| Constraint | Why | Impact |
|-----------|-----|--------|
| No `process.env` anywhere | Cloudflare Workers don't have `process` object | TypeError at runtime |
| No Node.js built-ins (`fs`, `path`, `crypto`) | Not available on Workers platform | NameError at runtime |
| No CommonJS `require()`; use ESM only | Workers runtime requires ESM | Parse error at build time |
| No `Buffer`; use `Uint8Array` / `TextEncoder` | Buffer not available on platform | NameError at runtime |
| No raw `fetch` without error handling | Network failures crash app without explicit handlers | Unhandled promise rejection |
| No secrets in source code or `wrangler.jsonc` vars | Secrets in repos leak to GitHub | Security breach |
| No `any` in public API types | Defeats TypeScript's type safety | Type errors in consumer code |
| No `@ts-ignore` or `eslint-disable` without comment | Suppresses real issues instead of fixing them | Tech debt spiral |

**Action**: Before committing, run:
```bash
npm run typecheck  # zero errors required
npm run lint       # --max-warnings 0
```

## Common Errors & Resolutions

### Error: "Cannot find module '@latimer-woods-tech/auth' is not in the npm registry"

**Root Cause**: Packages published out of dependency order. Package A tries to import Package B, but B wasn't published yet.

**Example**:
- `@latimer-woods-tech/neon` (which depends on `@latimer-woods-tech/logger`) is tagged and pushed
- CI publishes Neon before Logger is published → 404 on npm registry

**Prevention**:
1. Follow strict dependency order (see CLAUDE.md)
2. Tag multiple packages in sequence, but wait for each publish to complete before tagging the next
3. Check GitHub Packages UI before tagging next package: https://github.com/adrper79-dot?tab=packages

**Fix**:
```bash
# Delete the failed tag locally and remotely
git tag -d @latimer-woods-tech/neon/v0.2.0
git push origin :refs/tags/@latimer-woods-tech/neon/v0.2.0

# Wait for Logger to publish
# Then re-tag and re-push
git tag @latimer-woods-tech/neon/v0.2.0
git push origin @latimer-woods-tech/neon/v0.2.0
```

### Error: "TypeScript strict mode: 'user' implicitly has type 'any'"

**Root Cause**: Hono context variable not declared with proper type augmentation.

**Example**:
```typescript
// ❌ Fails strict mode
const user = c.get('user');  // c.user is unknown; implicitly any
```

**Prevention**: Add module augmentation to every app that uses auth:

```typescript
declare module 'hono' {
  interface ContextVariableMap {
    user: JWTPayload;
    analytics: Analytics;
    db: DB;
  }
}
```

**Fix**: Run `npm run typecheck` locally, fix the type error, then commit.

### Error: "403 Forbidden: PUT https://npm.pkg.github.com/@adrper79-dot%2fXXX"

**Root Cause**: Wrong npm registry or scope mismatch in `package.json`.

**Example**:
```json
{
  "name": "@adrper/errors",  // scope is @adrper, not @adrper79-dot
  "publishConfig": {
    "registry": "https://registry.npmjs.org"  // wrong registry (public npm)
  }
}
```

**Prevention**:
1. All packages must use scope `@adrper79-dot`
2. All packages must point to GitHub Packages registry

**Fix**:
```json
{
  "name": "@latimer-woods-tech/errors",
  "publishConfig": {
    "registry": "https://npm.pkg.github.com"
  }
}
```

### Error: "ESLint: no-unsafe-assignment"

**Root Cause**: Vitest v1 (used by this project) does **not** support generic type parameters on `vi.fn()`. Adding a generic causes a TypeScript parse error. Without one, ESLint sees the return type as `any`.

**Example**:
```typescript
// ❌ Causes TS error — Vitest v1 does not support fn<Type>() generics
const mockFetch = vi.fn<[RequestInfo, RequestInit], Promise<Response>>();

// ✅ Correct pattern for Vitest v1 — cast the mock to the concrete type
const mockFetch = vi.fn() as unknown as typeof fetch;
```

**Prevention**: Cast `vi.fn()` to a concrete type using `as unknown as typeof X` — never use the generic syntax in Vitest v1.

**Related**: See [packages/content/src/index.test.ts](../../packages/content/src/index.test.ts) for complete pattern.

### Error: "Hyperdrive connection failed: ECONNREFUSED"

**Root Cause**: Database connection string is wrong, or Hyperdrive binding name doesn't match Drizzle config.

**Example**:
```json
// wrangler.jsonc
{
  "hyperdrive": {
    "DB": "postgres://..."  // binding name is "DB"
  }
}
```

```typescript
// drizzle.config.ts
export default defineConfig({
  schema: './src/schema.ts',
  out: './src/db',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL  // ❌ Wrong! Should use Hyperdrive binding
  }
});
```

**Prevention**:
1. In `wrangler.jsonc`, define Hyperdrive binding (e.g., `"DB"`)
2. In app's `env.ts`, expose binding: `export type Bindings = { DB: Hyperdrive }`
3. In Hono context: Use `c.env.DB` to query database
4. In Drizzle migrations: Use `c.env.DB.query()` directly

**Fix**:
```typescript
// ✅ Correct pattern
const db = drizzle(c.env.DB, {
  schema: dbSchema,
  logger: true
});
```

### Error: "Rate limit exceeded: too many requests in 60s"

**Root Cause**: No rate limiting middleware, or middleware is misconfigured.

**Prevention**:
1. All apps must have rate limiting on auth routes
2. All 6 apps must wire `initAnalytics` to track rate limit hits

```typescript
// src/index.ts
app.use('/auth/*', rateLimitMiddleware({
  windowMs: 60 * 1000,    // 60 seconds
  maxRequests: 10,        // 10 requests
  keyGenerator: (c) => c.req.header('cf-connecting-ip') || 'unknown'
}));
```

### Error: "'token' is not defined"

**Root Cause**: Using `jsonwebtoken` package instead of Web Crypto API (constraint violation).

**Example**:
```typescript
// ❌ Fails on Cloudflare Workers
import jwt from 'jsonwebtoken';
const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET);
```

**Prevention**: All JWT operations use Web Crypto API only.

```typescript
// ✅ Correct
import { SignJWT } from 'jose';
const token = await new SignJWT({ id: user.id })
  .setProtectedHeader({ alg: 'HS256' })
  .setExpirationTime('24h')
  .sign(new TextEncoder().encode(JWT_SECRET));
```

### Error: "git push hangs forever on Windows (GCM credential prompt)"

**Root Cause**: Windows Git Credential Manager (GCM) opens an invisible auth dialog that blocks the terminal — `git push origin main` appears to hang indefinitely.

**Diagnosis**: `git push` produces no output and never returns.

**Fix** — bypass GCM entirely using `gh auth token`:
```powershell
$token = gh auth token
$encoded = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("x-access-token:$token"))
git -c credential.helper="" -c "http.extraheader=Authorization: Basic $encoded" push origin main
```

**Why it works**: `credential.helper=""` disables GCM for this invocation; the `http.extraheader` provides the PAT directly as a Basic-auth header.

**Prevention**: Keep `gh` CLI authenticated (`gh auth status`). When pushing from scripts, use this pattern or set `GIT_TERMINAL_PROMPT=0` to fail fast instead of hanging.

### Error: "create-hyperdrive workflow: Store step fails with 403"

**Root Cause**: The `GITHUB_TOKEN` auto-provided by GitHub Actions does **not** have permission to write repository secrets. The "Store Hyperdrive IDs as GitHub secrets" step always fails with a 403.

**The Create Hyperdrive step always succeeds** — the UUID is printed in the logs even when the Store step fails.

**Workaround** (standard Factory pattern):
1. After running `create-hyperdrive.yml`, view the workflow logs and copy the UUID:
   ```bash
   gh run view <RUN_ID> --repo Latimer-Woods-Tech/factory --log | grep "{app}-db ->"
   # Output: [created] xico-city-db -> 0c15bc97978841f88a78da8253ea3d32
   ```
2. Hard-code the UUID in the scaffold workflow (`--hyperdrive-id "0c15..."`):
   ```yaml
   printf '\n\n\n\n\n\n\n\n' | node packages/deploy/scripts/scaffold.mjs {app} \
     --hyperdrive-id "0c15bc97978841f88a78da8253ea3d32" \
   ```
3. Store it manually as a GitHub secret:
   ```bash
   echo "0c15bc97978841f88a78da8253ea3d32" | gh secret set HYPERDRIVE_{APP} --repo Latimer-Woods-Tech/factory
   ```

**Why not fix the workflow?** Setting repo secrets requires a PAT with `secrets:write` scope, which should not be stored as a workflow secret (circular risk). The manual step is deliberate.

### Error: "Can't read from console.log in Wrangler logs"

**Root Cause**: Workers console output goes to `stderr`, not `stdout`, due to the streaming model.

**Prevention**: Use the `@latimer-woods-tech/logger` package instead of `console.log` for structured logging.

```typescript
// ✅ Correct
import { createLogger } from '@latimer-woods-tech/logger';
const logger = createLogger('myapp');
logger.info('User logged in', { userId: user.id });
```

### Error: "Cannot read property 'x' of undefined"

**Root Cause**: Database query returned no rows, code assumes a row exists.

**Prevention**: Always check for undefined or use optional chaining.

```typescript
// ❌ Unsafe
const user = await db.query.users.findFirst({ where: eq(users.id, id) });
return user.name;  // crashes if user is undefined

// ✅ Safe
const user = await db.query.users.findFirst({ where: eq(users.id, id) });
if (!user) throw new NotFoundError(`User ${id} not found`);
return user.name;
```

## Patterns That Work

### 1. Middleware Chain Pattern

All 6 apps follow this identical pattern in `src/index.ts`:

```typescript
import Hono from 'hono';
import { sentryMiddleware } from '@latimer-woods-tech/monitoring';
import { initAnalytics } from '@latimer-woods-tech/analytics';

declare module 'hono' {
  interface ContextVariableMap {
    analytics: Awaited<ReturnType<typeof initAnalytics>>;
  }
}

const app = new Hono();

// 1. Error boundary (global)
app.use('*', (c, next) =>
  sentryMiddleware({
    dsn: c.env.SENTRY_DSN,
    environment: c.env.ENVIRONMENT,
    workerName: 'app-name'
  })(c, next)
);

// 2. Analytics initialization (all routes)
app.use('*', async (c, next) => {
  const analytics = initAnalytics({
    postHogKey: c.env.POSTHOG_KEY,
    db: c.env.DB,
    appId: 'app-name'
  });
  c.set('analytics', analytics);
  await analytics.page(c.req.path, { method: c.req.method });
  return next();
});

// 3. Routes (then add specific route handlers)
app.post('/auth/login', async (c) => {
  // ...auth logic...
  const analytics = c.get('analytics');
  await analytics.identify(user.sub, { tenantId, role });
  return c.json({ success: true });
});

export default app;
```

**Why this works**:
- Error boundary catches all errors (Sentry)
- Analytics is available on every route
- User identification happens after auth succeeds
- Rate limiting tracked per endpoint

### 2. Environment & Bindings Pattern

All apps expose a consistent `env.ts`:

```typescript
// src/env.ts
import type { Hyperdrive } from '@cloudflare/hyperdrive';

export type Bindings = {
  CF_API_TOKEN: string;
  CF_ACCOUNT_ID: string;
  SENTRY_DSN: string;
  POSTHOG_KEY: string;
  ENVIRONMENT: 'development' | 'staging' | 'production';
  DB: Hyperdrive;
};

declare global {
  type AppEnv = {
    Bindings: Bindings;
  };
}
```

Then in `wrangler.jsonc`:

```jsonc
{
  "env": {
    "production": {
      "vars": {
        "SENTRY_DSN": "https://xxx@xxx.ingest.sentry.io/xxx",
        "POSTHOG_KEY": "phc_xxx...",
        "ENVIRONMENT": "production"
      }
    }
  },
  "hyperdrive": {
    "DB": "postgres://user@host/dbname"
  }
}
```

### 3. Error Handling Pattern

All errors inherit from `@latimer-woods-tech/errors`:

```typescript
import { ValidationError, NotFoundError, AuthenticationError } from '@latimer-woods-tech/errors';

// ✅ Custom errors with context
throw new ValidationError('Email is required', {
  field: 'email',
  value: input.email,
  context: { form: 'signup' }
});

throw new NotFoundError(`User ${id} not found`, {
  context: { userId: id, endpoint: '/api/users/:id' }
});

// Sentry automatically catches these and includes context
```

### 4. Database Query Pattern

All queries use Drizzle ORM with explicit error handling:

```typescript
import { db } from '@latimer-woods-tech/neon';
import { eq } from 'drizzle-orm';
import { users } from '@latimer-woods-tech/content';

// ✅ Always check for undefined
const user = await db.query.users.findFirst({
  where: eq(users.id, userId)
});

if (!user) {
  throw new NotFoundError(`User ${userId} not found`);
}

return user;
```

## Version & Publishing Strategy

### Current Canonical Version

All 19 packages are at **v0.2.0** as of Stage 6.

### How to Bump Versions

1. **Edit one package's `package.json`**:
   ```json
   {
     "name": "@latimer-woods-tech/errors",
     "version": "0.2.1"
   }
   ```

2. **Run `npm install` to update lock file**:
   ```bash
   cd packages/errors
   npm install
   ```

3. **Commit and tag**:
   ```bash
   git add packages/errors/package.json packages/errors/package-lock.json
   git commit -m "chore(errors): bump to v0.2.1"
   git tag errors/v0.2.1
   git push origin main
   git push origin errors/v0.2.1
   ```

4. **Wait for GitHub Actions publish to complete**:
   - Go to: https://github.com/Latimer-Woods-Tech/factory/actions
   - Check: Publish workflow succeeded

5. **Update dependent packages**:
   - If another package depends on `@latimer-woods-tech/errors`, update its `package.json`
   - Follow dependency order (see CLAUDE.md)

**Common Mistake**: Publishing packages out of order → peer dependency hell. Check GitHub Packages before tagging the next one.

## Quality Gate Checklist

Before merging **any** package:

- [ ] `npm run typecheck` → 0 errors
- [ ] `npm run lint` → 0 warnings (checked with `--max-warnings 0`)
- [ ] `npm test` → all passing, 90%+ line coverage, 85%+ branch coverage
- [ ] `npm run build` → no errors, `dist/` exists
- [ ] JSDoc on 90%+ exported symbols (check with `npm run docs:check`)
- [ ] No `any`, `@ts-ignore`, or `eslint-disable` in public APIs
- [ ] Commit follows `<type>(<scope>): <description>` format
- [ ] Version bumped in `package.json` (matches git tag)

**Enforcement**: All checks run in `.github/workflows/publish.yml` and block publish if any fail.

## Monitoring & Observability

### What We Track

1. **Sentry** (errors):
   - Uncaught exceptions
   - API 5XX responses
   - Validation errors with field context
   - Auth failures (rate limits, invalid tokens)

2. **PostHog** (user behavior + business events):
   - Page views (every route accessed)
   - Rate limit hits (tracked per endpoint)
   - User identification (sub, tenantId, role)
   - Custom business events (signup, purchase, export, etc.)

### Why Both Are Needed

| Tool | Coverage | Alerts? |
|------|----------|---------|
| Sentry | Technical errors + exceptions | Yes (>100/day = alert) |
| PostHog | All page views + custom events | No (for analysis only) |
| Combined | Complete picture of app health + user behavior | Essential for debug |

**Real Example**: User reports "can't log in". Check:
- PostHog: Did user hit rate limit? (check `auth.rate_limit_exceeded` events)
- Sentry: Did auth endpoint throw 5XX? (check error logs)
- Together: "Rate limit hit at 3:15pm, 127.0.0.1 had 11 attempts in 60s"

## Quarterly Review Checklist

Update this doc if any of the following occur:

- [ ] New common error discovered → add to "Common Errors" section
- [ ] New pattern worked well → add to "Patterns" section
- [ ] Hard constraint was violated (was there a reason?) → decide if constraint needs update
- [ ] Package update broke something → document in version section
- [ ] Deployment failed for new reason → add to troubleshooting
- [ ] Security issue discovered → update runbooks

## Incident Post-Mortems

### 2026-04-27 — selfprime.net Outage + Login Broken (prime-self rename)

**What Happened (root causes, in order):**

1. **Pages secrets wiped** — `prime-self-ui` had `CF_API_TOKEN` and `CF_ACCOUNT_ID` removed. Every deploy since April 27 silently failed. `selfprime.net/` became stale and eventually returned 404 when a route expired.

2. **No index.html** — `prime-self-ui/public/` had `landing.html` but no `index.html`. Once the Pages cache expired, `selfprime.net/` returned 404 because Pages needs `index.html` as the root document.

3. **Worker rename broke hardcoded URL** — `prime-self/wrangler.jsonc` was changed from `name: "prime-self"` to `name: "prime-self-api"`. The frontend (`landing.html` line ~537) hardcoded `https://prime-self.workers.dev/auth/login`. After the rename, that URL stopped resolving → ERR_NAME_NOT_RESOLVED.

4. **Wrong URL format** — The hardcoded URL `prime-self.workers.dev` was never the correct format. Cloudflare Workers URLs are always `{name}.{account-subdomain}.workers.dev` → `prime-self.adrper79.workers.dev`. The short form only resolves when you have a custom workers.dev route explicitly enabling it.

5. **Stale migration block** — After reverting the rename, the `wrangler.jsonc` still had a migrations block `{ "tag": "v1", "deleted_classes": ["LiveSession"] }`. Cloudflare returned `[code: 10074]` because that migration was already applied to the `prime-self` worker in a previous session; it can't be applied again.

6. **False "done" declarations** — Twice declared a fix "working" based only on CI green (✓), without running `curl`. CI green means code compiled. It does NOT mean the endpoint returns 200.

**Fixes Applied:**

- Created `prime-self-ui/public/index.html` (copy of landing.html) — fixes root 404
- Restored secrets to `prime-self-ui` GitHub repo (`CF_API_TOKEN`, `CF_ACCOUNT_ID`)
- Reverted `prime-self/wrangler.jsonc` name from `prime-self-api` back to `prime-self`
- Removed stale `migrations` block from `wrangler.jsonc`
- Updated `landing.html` and `index.html` URL: `prime-self.workers.dev` → `prime-self.adrper79.workers.dev`
- Added smoke test jobs to both deploy workflows
- Created `docs/service-registry.yml` — authoritative map of worker names → URLs → consumers
- Added Worker Rename Protocol and Verification Requirement to `CLAUDE.md`

**Rules Added as a Result:**

> **Before renaming any worker**: Check `docs/service-registry.yml`, find all consumers, update them first, deploy consumers, THEN rename the worker.

> **Before declaring a fix done**: `curl` the endpoint and observe the HTTP status with your own eyes. CI green is not sufficient.

> **Cloudflare workers.dev URLs**: Always use the account-scoped form `{name}.adrper79.workers.dev`. The short form `{name}.workers.dev` does not resolve without an explicit workers.dev route.

> **Pages root document**: `public/index.html` must exist. `landing.html` will NOT serve as the root.

> **Secrets are per-repo**: Each app repo needs its own `CF_API_TOKEN` and `CF_ACCOUNT_ID`. They are NOT inherited from Factory Core.

---

## See Also

- [CLAUDE.md](../../CLAUDE.md) — Standing orders & hard constraints
- [Service Registry](../service-registry.yml) — Worker name → URL → consumer map
- [GitHub Secrets & Tokens Runbook](./github-secrets-and-tokens.md) — Secrets management
- [Secret Rotation Runbook](./secret-rotation.md) — How to rotate specific secrets
- [Deployment Runbook](./deployment.md) — How to deploy apps
- [Getting Started Runbook](./getting-started.md) — First-time setup

---

## GitHub Governance & Autonomous LLM Review

This section covers patterns and lessons from building the factory's fully autonomous PR review pipeline (shipped May 2026).

### Architecture: Grok → Claude 2-Party Consensus

All LLM-gated PRs go through two independent model passes before any action is taken:

```
PR opened / synchronize
  └─► pr-review.yml
        └─► pr-review.mjs
              1. Grok first-pass  (xAI API)  → { lgtm, concerns[] }
              2. Claude second-pass (Anthropic) → { lgtm, concerns[] }
              APPROVE only when BOTH lgtm=true
              Otherwise CHANGES_REQUESTED with merged concerns
```

**Why two models?** Single-model reviews hallucinate approvals on code that violates constraints. Requiring *both* Grok and Anthropic-Claude to independently confirm reduces false approvals without requiring human intervention on green/yellow PRs.

**Lesson Learned:** Do not short-circuit on first-pass LGTM. The second pass consistently catches constraint violations (process.env, Buffer, require) that Grok misses when they appear in large diffs.

### Bot Identity: CODEOWNERS + Ruleset Bypass

Enabling a GitHub App bot to merge as a co-owner requires **both**:

1. **CODEOWNERS co-ownership** — add `factory-cross-repo[bot]` as a co-owner on the paths you want the bot to approve:
   ```
   # Green paths (docs, markdown)
   docs/**  @adrper79-dot factory-cross-repo[bot]
   *.md     @adrper79-dot factory-cross-repo[bot]

   # Yellow paths (app source, tests)
   apps/*/src/**  @adrper79-dot factory-cross-repo[bot]
   tests/**       @adrper79-dot factory-cross-repo[bot]

   # Red paths (infrastructure) — human only
   packages/**  @adrper79-dot
   .github/workflows/**  @adrper79-dot
   wrangler.jsonc  @adrper79-dot
   ```

2. **Ruleset bypass actor** — add the GitHub App as an `Integration` bypass actor on the branch-protection ruleset (UI: Settings → Rules → Rulesets → edit ruleset → add bypass actor type=Integration, actor=factory-cross-repo).

**Lesson Learned:** CODEOWNERS co-ownership alone is not enough. Without the ruleset bypass actor, the bot's approval satisfies CODEOWNERS but the ruleset still blocks the merge. Both are required.

**Lesson Learned:** Never add the bot as a bypass actor on red-tier paths (infrastructure). Red PRs must always require a human review even if the bot passes both LLM checks.

### Retry Limit and Escalation

After `MAX_REVIEW_ATTEMPTS` bot-submitted `CHANGES_REQUESTED` reviews on a single PR, escalate rather than loop:

1. Label PR `supervisor:review-limit-reached`
2. File a GitHub issue describing the stalled PR
3. Request human review from `HUMAN_REVIEWER`
4. Post a PR comment linking the issue

```yaml
env:
  MAX_REVIEW_ATTEMPTS: '3'        # default; override per-workflow
  HUMAN_REVIEWER: 'adrper79-dot'
```

**Lesson Learned:** Without a retry limit, a PR that the LLM perpetually disagrees with will loop forever, burning API credits. Three attempts is a reasonable threshold before assuming the diff requires human judgment.

### Supervisor PR Feedback Loop

The supervisor's scheduled job (`supervisor-loop.yml`, every 4 hours) now includes a pre-pass that self-heals stalled bot PRs:

```
supervisor-core.mjs main()
  1. runPrFeedbackLoop()
     - Find all open PRs opened by factory-cross-repo[bot] with state CHANGES_REQUESTED
     - For each: fetch review comments, call Claude to generate file fixes
     - Apply three hallucination guards (see below)
     - Commit fixes to the PR branch  →  triggers `synchronize`  →  pr-review.yml reruns
  2. processIssues() — normal issue→PR flow
```

**Lesson Learned:** Committing to the PR branch and letting `pr-review.yml` re-trigger via `synchronize` is cleaner than calling the review API directly from the supervisor. It keeps review logic in one place.

### Hallucination Guards

Three guards run on every LLM-generated file before it is committed:

| # | Guard | What it checks |
|---|-------|---------------|
| 1 | `checkGeneratedContent()` | Constraint violations (process.env, require, Buffer, Node built-ins, Express); empty files; line-count limit configurable via `MAX_GENERATED_LINES` (default 800) |
| 2 | `enforceSlotSchema()` | Strip keys not in declared template schema; null values matching injection verb patterns |
| 3 | `fixAddressesConcerns()` | At least one concern keyword from the review must appear in changed lines (added OR removed) |

**Guard 1 — Strip comments before scanning:** Run `stripCommentsAndStrings()` on the source before applying the constraint regexes. Otherwise JSDoc examples (`// never use Buffer`) trigger false violations.

**Guard 2 — Injection filter must be structural:** A broad substring match (`/ignore previous/i`) will null legitimate content (e.g., security docs that discuss jailbreaking). Use a 3-token imperative-verb pattern instead:
```js
const INJECTION_RE = /\b(ignore|disregard|forget|override)\s+(previous|above|all|prior|earlier)\s+(instructions?|context|rules?|prompt)/i;
```

**Guard 3 — Count removed lines too:** A fix that works by deleting bad code produces zero added lines. Check `addedLines ∪ removedLines` against concern keywords, not just added lines.

**Lesson Learned:** All three guards had initially high false-positive rates in the first pass. The root causes were: (1) scanning comments, (2) overly broad injection filter, and (3) only checking added lines. All three are now patched.

### GraphQL Variable Naming in Project Board Sync

GitHub's Projects v2 GraphQL API is strict about variable declarations. A `$contentId` variable used in the mutation body **must** be declared in the query signature:

```graphql
# ❌ Breaks silently — contentId used but not declared
mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!) {
  updateProjectV2ItemFieldValue(input: { projectId: $projectId, itemId: $itemId, fieldId: $fieldId, value: { singleSelectOptionId: $contentId } })
}

# ✅ Correct — all variables declared
mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $contentId: String!) {
  updateProjectV2ItemFieldValue(...)
}
```

**Lesson Learned:** GraphQL variable errors in Actions workflows produce a `422 Unprocessable Entity` with a `{"message": "Variable $contentId is not defined..."}` body. They do NOT cause the workflow to exit — the `gh api graphql` call returns exit 0 with the error body in stdout. Always pipe through `jq .errors` to detect these silently swallowed failures.


---

## Supervisor System — May 2026

### Best-Practice Template Pipeline

**Problem:** The supervisor had a 3-place sync requirement: every new template type needed to be added to (1) a YAML file, (2) MATCH_RULES in supervisor-core.mjs, and (3) the SEED array in load.ts. This caused package-version-migration to never match — it existed in YAML but not in MATCH_RULES.

**Fix:** Build-time generator (scripts/generate-supervisor-templates.mjs) reads all docs/supervisor/plans/*.yml via js-yaml, validates schema and regex patterns, and emits 	emplates.generated.ts. The Worker's load.ts imports from that file. Both the Worker's match.ts and the GHA supervisor-core.mjs derive match signals exclusively from the YAML 	riggers block. Adding a new template now requires only editing the YAML file.

**Key pitfalls fixed:**
- YAML double-quoted strings mangle \s → s and \. → . — always use single quotes for regex values
- PCRE inline flags (?is) are incompatible with JS RegExp — strip them and use flag arguments instead
- @cloudflare/workers-types injected via 	sconfig.types + imported via import type creates duplicate type identities → TS2322 mismatch. Use only the 	ypes injection; remove named imports
- ScheduledHandler expects ScheduledController as first param, not ScheduledEvent

### Supervisor Duplicate PR Race Condition

**Problem:** The supervisor ran concurrently (or retried before GH API label propagation) and opened 3 identical PRs (#287, #288, #289) for issue #286. The gent:claimed:sauna label filter is the primary dedup, but it isn't visible until after the label write completes — which happens after PR creation.

**Fix:** indExistingPR() queries open pulls for PRs whose body contains **Source issue:** #N before calling xecuteGreen. If a matching PR exists, return it without creating a branch. This is a secondary guard; the label filter remains the primary.

**Key insight:** Always add a PR-level dedup check when automation can open PRs, because label propagation is eventually-consistent — not immediate.

### validate-docs-quality.mjs Design

**Requirements (issue #286):** Fast (< 10 s), deterministic, bounded output, --max-errors N, --json report mode, no symlink loops.

**Implementation:** Bounded traversal of docs/, pps/*/README.md, and root *.md only. Skips symlinks, 
ode_modules, dist, .wrangler. Builds an anchor index from headings and id= attributes. Extracts relative Markdown links and resolves against the filesystem. Exits 1 with one FILE:LINE → TARGET (reason) line per broken link.

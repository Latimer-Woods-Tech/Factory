# SUP-1.4 Migration Guide — Migration Drift Guard

**Factory issue:** `factory#96` (SUP-1.4)
**Parent:** `factory#96` (SUP-1)

**Target repo(s):** `Latimer-Woods-Tech/HumanDesign` (then `xico-city`, `videoking` once they have migrations)

---

## What this does

Adds a GitHub Actions workflow to each app repo that:

1. **On every PR touching `workers/src/db/migrations/**`** — fails CI when the repo contains migration files that have not been applied to the production Neon branch.  Prevents `shared_at`/`display_name`-class bugs from reaching prod.

2. **On a daily cron (08:00 UTC)** — posts a Pushover alert (channel `conn_iR1TgasqajZH`) when drift is detected outside of a PR context (e.g. a hotfix applied directly to the DB, or a migration file committed without running `drizzle-kit migrate`).

The detection logic lives in `scripts/check-migration-drift.mjs` in the factory repo and is sparse-checked out by the reusable workflow on each run.

---

## Files in this bundle

| File | Destination in app repo |
|---|---|
| `migration-drift-guard.yml` | `.github/workflows/migration-drift-guard.yml` |

---

## Pre-flight: verify the migration table

Before applying the workflow, confirm the table name against production:

```bash
# Replace with the real production connection string
psql "$HUMANDESIGN_CONNECTION_STRING" -c \
  "SELECT COUNT(*) AS applied FROM drizzle.__drizzle_migrations;"
```

If the table does not exist yet, no migrations have been applied. The guard will
report drift equal to the full journal length — apply outstanding migrations
before enabling the workflow (or the job will fail on every run).

---

## Applying to HumanDesign

```bash
# 1. Clone HumanDesign
git clone git@github.com:Latimer-Woods-Tech/HumanDesign.git
cd HumanDesign
git checkout -b chore/sup-1.4-migration-drift-guard

# 2. Copy the workflow
cp path/to/sup-1.4-migration-drift-guard/migration-drift-guard.yml \
   .github/workflows/migration-drift-guard.yml

# 3. Commit and push
git add .github/workflows/migration-drift-guard.yml
git commit -m "chore(ci): add migration drift guard (SUP-1.4)"
git push -u origin chore/sup-1.4-migration-drift-guard

# 4. Open a PR and verify:
#    - CI passes when repo and prod are in sync (main branch, all applied)
#    - CI fails on a branch where a new .sql file is added but not applied
```

---

## Required secrets

Set these in **HumanDesign → Settings → Secrets → Actions** (or at org level):

| Secret | Value | Notes |
|---|---|---|
| `HUMANDESIGN_CONNECTION_STRING` | Direct Neon connection string for the **production** branch | Format: `postgres://user:pass@host/dbname?sslmode=require`. Get from Neon console → Project → Connection string → Direct. NOT the Hyperdrive pooler URL. |
| `PUSHOVER_TOKEN` | Pushover app token | From Pushover dashboard → Your Applications |
| `PUSHOVER_USER` | Pushover user/group key | From Pushover dashboard → Your User Key (channel: `conn_iR1TgasqajZH`) |

> **Tip:** `PUSHOVER_TOKEN` and `PUSHOVER_USER` may already be set at org level if other apps use the same channel.

---

## Acceptance gates

| Test | Expected result |
|---|---|
| Open a PR that adds a new `.sql` migration file without applying it to prod | Workflow **fails** with "Migration drift detected" output and a gap list |
| Merge all migrations, verify main is in sync | Workflow **passes** with "No migration drift detected" |
| Introduce drift manually overnight (add a `.sql` file, don't apply) | Next 08:00 UTC cron fires a Pushover alert within the cycle |

---

## Cloning to xico-city / videoking

Once those repos have a `workers/src/db/migrations/` directory and a `drizzle.__drizzle_migrations` table:

1. Copy `migration-drift-guard.yml` into the app repo's `.github/workflows/`.
2. Change `app_name` to `'xico-city'` or `'videoking'`.
3. Change `DATABASE_URL` secret name to `XICOCITY_CONNECTION_STRING` or `VIDEOKING_CONNECTION_STRING`.
4. Adjust `migrations_path` if the migrations directory is in a different location.

---

## How it works (technical)

```
PR or cron trigger
  │
  └─► _migration-drift-guard.yml (factory reusable)
        ├─ Checkout app repo       (migration files)
        ├─ Sparse-checkout factory  (scripts/check-migration-drift.mjs)
        ├─ npm install --no-save postgres
        └─ node scripts/check-migration-drift.mjs
              ├─ Reads  meta/_journal.json → repoCount, repoLatest
              ├─ Queries drizzle.__drizzle_migrations → prodCount
              ├─ If repoCount > prodCount:
              │     print gap, exit 1 (fails CI)
              │     if SEND_PUSHOVER=1: POST to api.pushover.net
              └─ else: exit 0 (passes CI)
```

The detection uses **journal entry count vs DB row count** rather than hash
comparison, which is simpler and sufficient for ordered sequential migrations.
The gap is rendered as a numeric range (e.g. `0081..0090`) when contiguous, or
as a comma-separated list otherwise.

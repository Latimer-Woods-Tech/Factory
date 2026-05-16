# Supervisor LESSONS

**Read by:** `.github/scripts/supervisor-core.mjs` on every tick (as system prompt prefix, after `CONTEXT.md` and `PATTERNS.md`).  
**Sibling docs:** [`CONTEXT.md`](./CONTEXT.md) (governance) · [`../architecture/PATTERNS.md`](../architecture/PATTERNS.md) (operational know-how) · [`FRIDGE.md`](./FRIDGE.md) (non-negotiable rules) · [`TRUST_LADDER.md`](./TRUST_LADDER.md) (autonomy tiers)  
**Maintained:** hand-maintained until RFC-005 (Anthropic Dreaming pilot, Q3 2026) ships — at which point Dreaming writes consolidated session memories here automatically.

This file captures **supervisor-specific learnings** — patterns observed from supervisor PR rejections, near-misses, and cross-session corrections that the supervisor itself should consult before opening a new PR. It complements [`PATTERNS.md`](../architecture/PATTERNS.md), which holds repo-wide operational know-how.

**Append discipline:** when a CODEOWNER (currently `@adrper79-dot`) rejects a supervisor PR with a reason that would apply to *future* supervisor work, capture the lesson here in the same commit that resolves the rejection. Format:

```markdown
## NNN. Short title (commit-style — imperative, ≤72 chars)

**Triggered by:** PR #NNN — one-line summary of the rejection
**Pattern:** what to do (or not do) next time
**Why:** the underlying reason
**Scope:** templates / repos / file paths this applies to
```

---

## 1. Mirror the proven aggregator PR-pattern when writing to `main`

**Triggered by:** Stage 1 close-out 2026-05-15 — supervisor PRs that wrote to `docs/cost/`, `docs/conformance/`, `docs/STACK.md` failed with `GH013: Repository rule violations` on direct push to `main`.

**Pattern:** Any workflow or supervisor action that needs to commit to `main` must open a per-run PR with the `auto-merge` label, not push directly. See [`PATTERNS.md` §3](../architecture/PATTERNS.md) for the exact `git checkout -b chore/<topic>-YYYY-MM-DD-HHMM` + `gh pr create --label auto-merge` recipe.

**Why:** `main` is branch-protected; even `github-actions[bot]` cannot bypass without `--admin`, which is reserved for human-authored emergencies.

**Scope:** every supervisor template that mutates repository state. Applies to `chore-add-skeleton-doc`, `chore-update-supervisor-templates`, and any future template that writes to `docs/` or root-level files.

---

## 2. Strip leading UTF-8 BOM from any secret value before HTTP use

**Triggered by:** Stage 1 close-out — Anthropic / Cloudflare / Sentry / Stripe HTTP calls crashed with `'latin-1' codec can't encode character '﻿'` after fetching keys from GCP Secret Manager that had been pasted from Windows editors.

**Pattern:** When the supervisor (or anything it generates) fetches a secret value from any source and passes it as an HTTP header, **strip the leading `\xEF\xBB\xBF` BOM byte and trailing whitespace** before use. See `scripts/fetch_gcp_secrets.sh` for the canonical sed pattern; reference it from any new Worker / script that reads secrets.

**Why:** BOM is invisible in most UIs but breaks `latin-1` / `ascii` encoding used by Python and many HTTP libraries for header values.

**Scope:** any supervisor template that scaffolds new Worker code, ESM scripts, or shell scripts that fetch secrets. Add an explicit `// strip BOM` step to the generated code in those templates.

---

## 3. `gcloud` calls in GitHub Actions need explicit `--project`

**Triggered by:** Stage 1 close-out — `gcloud secrets versions access` returned NOT_FOUND for every secret name silently after `google-github-actions/auth@v3`.

**Pattern:** Any supervisor-generated workflow that runs `gcloud` after `google-github-actions/auth@v3` must pass `--project=factory-495015` (or read from `$GCP_PROJECT` / `$GOOGLE_CLOUD_PROJECT`) on every call. Don't rely on the auth step to set a default.

**Why:** `auth@v3` authenticates the service account but does NOT set a default gcloud project.

**Scope:** templates that scaffold GCP-aware workflows, Cloud Run integrations, or secret-fetching scripts.

---

## 4. `git diff --quiet docs/<dir>/` does not see new untracked files

**Triggered by:** Stage 1 close-out — conformance + cost workflows ran the underlying scripts, produced new JSON snapshots, then exited "No changes to commit" without writing them.

**Pattern:** For any "if there are changes, commit" guard on a directory of *generated* output, **stage first, diff the index second**:

```yaml
git add docs/<dir>/ 2>/dev/null || true
if git diff --quiet --cached docs/<dir>/; then
  echo "No changes."
  exit 0
fi
git commit ...
```

**Why:** `git diff --quiet` only inspects the working tree against `HEAD` for tracked paths. New untracked files are invisible to it.

**Scope:** any supervisor-generated workflow with a "commit if changed" step on a directory that contains generated/snapshot output.

---

## 5. Stale GCP service-account keys present as `invalid_grant: Invalid JWT Signature`

**Triggered by:** Stage 1 close-out — `VERTEX_SA_KEY` GitHub secret pointed to a JSON key whose corresponding user-managed key in GCP had been deleted. Symptom: every `gcloud` call after auth failed with "There was a problem refreshing auth tokens... invalid_grant: Invalid JWT Signature."

**Pattern:** If a supervisor task hits this error class, **the fix is rotation, not retry**. Generate a new user-managed key on the SA, upload to the GitHub Secret, delete the old key from GCP. Sequence:

```bash
gcloud iam service-accounts keys create /tmp/key.json \
  --iam-account=<sa>@<project>.iam.gserviceaccount.com
gh secret set <SECRET_NAME> < /tmp/key.json
gcloud iam service-accounts keys delete <old-key-id> \
  --iam-account=<sa>@<project>.iam.gserviceaccount.com --quiet
shred -u /tmp/key.json
```

**Why:** GitHub Secret stores the JSON; GCP IAM stores the public-key half. If they fall out of sync (e.g., manual cleanup in IAM, expired auto-rotated key, project-level key purge), JWT verification fails despite the JSON looking valid.

**Scope:** triage steps for any supervisor workflow that depends on GCP service-account auth — including the supervisor's own GitHub-App-token mint path if it ever leans on a GCP-signed JWT.

---

## How this file evolves

- **Today (manual):** append a new section when a CODEOWNER rejection surfaces a generalizable pattern. Number sequentially; do not renumber existing sections (numbering is link-stable from commit messages).
- **Q3 2026 (Dreaming):** [RFC-005](../rfc/RFC-005-anthropic-dreaming-pilot.md) replays past supervisor sessions through Anthropic's Managed-Agents Dreaming feature and writes consolidated lessons to this file automatically. Hand-maintained entries are preserved; they show their human authorship via the commit history.
- **If a lesson stops applying** (e.g., the underlying bug is fixed in the package): leave the entry in place with a `**Resolved:**` line citing the fix PR. Removing it would break commit-message references.

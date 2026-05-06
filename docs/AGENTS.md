> 📘 **Canonical architecture:** [`docs/architecture/FACTORY_V1.md`](../docs/architecture/FACTORY_V1.md). [`docs/supervisor/FRIDGE.md`](./supervisor/FRIDGE.md) is your step 0. Then this file for agent-specific rules.

# AGENTS.md

You are an AI agent landing in this repository. **Read this file first.** It tells you the rules of engagement so you don't break things or duplicate work.

---

## What you are looking at

`factory` is the shared infrastructure repo for the [Latimer-Woods-Tech](https://github.com/Latimer-Woods-Tech) GitHub organization. Eleven app repos depend on its reusable workflows and shared packages. Mistakes here propagate everywhere. Be careful.

The owner is [@adrper79-dot](https://github.com/adrper79-dot). When in doubt, propose, don't push.

---

## Read first, in order

1. [`README.md`](../README.md) — repo orientation
2. This file — rules for agents
3. [`docs/STACK.md`](STACK.md) — **versioned stack manifest** (package versions, AI tier routing, banned tools); check before touching any package or AI integration
4. [`docs/CI_CD.md`](CI_CD.md) — how CI/CD works
5. [`docs/NEW_APP_CHECKLIST.md`](NEW_APP_CHECKLIST.md) — how to add an app
6. The header comment of any reusable workflow you're modifying

If you skipped any of those, go back. Most agent failures here come from skipping reading.

---

## Discovery rules

- **Look in `docs/` before writing anything new.** This repo has accumulated a lot of documentation. Search before creating; you will likely find someone has already written what you're about to write.
- **Check `.github/workflows/` before creating a workflow.** 40+ workflows already exist. Most "new" workflows are actually variations of an existing one and should be parameterized into a reusable, not duplicated.
- **Check `packages/` before creating a package.** 24 packages cover the full stack — see [`docs/STACK.md`](STACK.md) for current versions and the banned-tools list. Don't duplicate what exists.

Use ripgrep aggressively. The repo is searchable. There is no excuse for redundant work.

---

## Authentication available to you

If you are running with the `factory-cross-repo` GitHub App:

| Resource | How |
|---|---|
| GitHub API (this org) | App installation token, scoped to Latimer-Woods-Tech |
| Cloudflare API | `CLOUDFLARE_API_TOKEN` org secret (Workers Scripts:Edit + R2 + KV + DNS) |
| Stripe API | `STRIPE_SECRET_KEY` org secret (live mode) |
| GitHub Packages | App token doubles as registry auth |

**Never paste a credential into chat, code, commit messages, or PR descriptions.** Secrets live in the vault. Reference them by name.

If you need to add a new org secret, use `actions/secrets#create-or-update-an-organization-secret` with the org's public key and PyNaCl (sealed box). Pattern is in `docs/runbooks/secret-rotation.md`.

---

## What you must not do without explicit human approval

- ❌ Push directly to `main` on **factory** (rulesets allow it for admins, but don't)
- ❌ Push directly to `main` on any app repo without CI passing
- ❌ Make a private repo public, or vice versa
- ❌ Delete a Cloudflare Worker, R2 bucket, KV namespace, or D1 database
- ❌ Delete a GitHub repo, branch (other than your own throwaway test branches), or release
- ❌ Delete an org secret
- ❌ Rotate the GitHub App private key (POM-04 — manual UI step)
- ❌ Change the org's plan, billing, or member visibility
- ❌ Change a repo's ruleset, environment protection rules, or access policy
- ❌ Change Stripe products, prices, webhook endpoints, or business profile in production
- ❌ Send live email, SMS, or push notifications outside of test mode
- ❌ Touch user-data tables in a Neon production DB

If you think you need to do one of those, **stop and ask the human first.**

---

## What you can do without asking

- ✅ Read any file in this repo
- ✅ Run any GitHub Actions workflow that's been published as `workflow_dispatch`
- ✅ Open a PR (never merge it yourself unless approved)
- ✅ Create a test branch and push experimental changes there
- ✅ Add documentation under `docs/`
- ✅ Add a new reusable workflow following the header-comment convention
- ✅ Update `docs/STATUS.md` if it's stale
- ✅ Run analysis scripts that read from external APIs (read-only)

---

## Branch naming

| Pattern | Use |
|---|---|
| `main` | Default, protected |
| `staging/*` | Staging deploys |
| `feat/<short-desc>` | Feature work |
| `fix/<short-desc>` | Bug fixes |
| `chore/<short-desc>` | Refactors, tooling, doc updates |
| `test/<short-desc>` | Throwaway experiments |

Branches auto-delete after merge. Don't fight it.

---

## Commit message format

Conventional Commits. The first line is what shows up in changelogs:

```
<type>(<scope>): <subject>

<body>

<footer>
```

Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`, `build`, `ci`, `revert`.

Examples:
```
chore: refresh Stripe price IDs (live monthly + annual + one-time)
feat(deploy): add post-deploy verify with auto-rollback
fix(ci): use App-token for cross-repo package installs
```

---

## How to be useful here

1. **Ship fewer, larger commits.** A PR that fixes one drift bug across 11 repos is better than 11 PRs. Use the `factory-cross-repo` App to do org-wide changes atomically.

2. **Update docs in the same PR as code.** If you change a reusable workflow's behavior, update its header comment and `docs/CI_CD.md` in the same commit.

3. **Make changes idempotent.** Provisioning workflows run repeatedly. If your workflow can't be re-run safely, it's broken.

4. **Surface receipts.** When you finish a task, post: what you ran, what changed, what you verified, and what's left. Hand-waving costs the human their trust.

5. **Be explicit about uncertainty.** If you don't know whether something is safe, say so and ask.

---

## When you are confused

- The truth about what's deployed is in **Cloudflare**, not this repo. Run `wrangler deployments list` (with the API token) before assuming what's live.
- The truth about what's installed is in **package-lock.json**, not the source. Always read the lockfile.
- The truth about who owns what is **CODEOWNERS**, not assumed.
- The truth about secrets is in the **vault**, not in code. Read the vault index, never guess.

---

## Reporting back

When you complete work, write to `docs/sessions/YYYY-MM-DD-<short-name>.md` with:

```markdown
# <date> — <short name>

## What changed
- bullet list

## What was verified
- specific receipts (PR numbers, run URLs, command outputs)

## What's left
- bullet list

## Decisions made / pending
- bullet list
```

Then point the human at the file. The human reads these to keep state. Don't make them dig.

---

## Org plan and constraints

- GitHub plan: **Team** (~$4/seat/mo). No GitHub Advanced Security. No Enterprise-tier features (private-repo cross-visibility access for reusable workflows, required reviewers on private repos).
- Cloudflare plan: Workers Paid (assumed). Hyperdrive enabled.
- Stripe: Standard live account, restricted keys with explicit scopes.
- Neon: Free or Scale (verify per project).

If a feature you want needs a higher tier, propose it; don't assume it exists.

---

## Last word

This is a small, fast-moving solo-founder operation that will eventually become a team. The discipline you bring now compounds. Sloppy work compounds the same way, in the wrong direction.

When in doubt: read the docs, propose a plan, ask before destructive action, ship clean PRs with receipts.

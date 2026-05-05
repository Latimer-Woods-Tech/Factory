## ✅ Definition of Ready — Does This Work Item Make Sense?

- [ ] Outcome is explicit (not "improve X", but "reduce to <Y" or "add feature Z with metric M")
- [ ] Owner assigned (Factory lead or app lead + person)
- [ ] Dependencies named (other work, external APIs, secret changes)
- [ ] Success metrics defined (measurable: latency, coverage, KPI, not "looks good")
- [ ] Design implications checked (API surface, UI changes, or "no UI changes")
- [ ] Data implications checked (schema, analytics, PII, or "no data changes")
- [ ] Operational implications checked (monitoring, runbook stub, or "no ops needed")
- [ ] Acceptance tests are designed (unit/integration/staging curl)

---

## 🔴 Fridge Rules — Non-Negotiable Checks ([full text](/docs/supervisor/FRIDGE.md))

> Skip any rule that does not apply to this PR. If unsure, don't skip.

- [ ] **Rule 1 — wordis-bond is off-limits.** This PR does not open, touch, or read any wordis-bond resource.
- [ ] **Rule 2 — No credentials.** No API keys, tokens, secrets, or key fragments appear in any doc, plan, PR body, or comment. If you found one: rotate it, do not just delete it from git.
- [ ] **Rule 3 — Red-tier paths.** If this PR touches `.github/workflows/**`, `packages/**`, `migrations/**`, Stripe handlers, or production Wrangler config — a human CODEOWNER has reviewed and approved. It will **not** auto-merge.
- [ ] **Rule 4 — `/admin` mutations.** If this PR introduces any `/admin` mutation, an out-of-band CODEOWNER ✅ has been obtained (plan-approval and PR-review do not substitute).
- [ ] **Rule 8 — Irreversible actions.** If this PR deletes Cloudflare resources, changes rulesets, mutates Stripe products/prices/webhooks, or sends live email/SMS — explicit human approval was obtained before the PR was opened.

---

## ✅ Definition of Done — Did We Build It Right?

### Code Quality
- [ ] Code review approved (≥2 approvals if required by branch protection)
- [ ] TypeScript strict + no `any` in public APIs (internal-only `any` must have comment)
- [ ] ESLint passes with `--max-warnings 0`
- [ ] Build succeeds: `npm run build` produces clean output

### Testing
- [ ] Coverage meets baseline:
  - Foundation packages (errors, monitoring, logger, auth): 95%+
  - Other packages: 85%+
  - Worker apps: 80%+
- [ ] Integration test added if this touches >1 package
- [ ] Error cases tested: timeout, invalid input, 3p API down, rate limit

### Deployment & Verification
- [ ] Staging deployment: successful build, no errors
- [ ] Manual verification: `curl https://{staging-url}/health` returns `200`
- [ ] Smoke test: happy path + one error scenario tested manually
- [ ] If database migration: rollback tested successfully on staging

### Documentation
- [ ] README updated (setup, usage, API, or breaking changes)
- [ ] JSDoc comments added/updated for public symbols
- [ ] Changelog entry added to CHANGELOG.md
- [ ] If new service: entry added to [docs/service-registry.yml](../docs/service-registry.yml)
- [ ] If new runbook: added to [docs/runbooks/](../docs/runbooks/)

### Design & Product (if UI changes)
- [ ] Design review passed
- [ ] Product KPI acceptance confirmed
- [ ] Copy reviewed (on-brand, accessible reading level)

### Performance (if applicable)
- [ ] Performance budget checked:
  - Cold Worker start: <50ms overhead
  - API latency: P99 impact <100ms
  - Bundle size: <50kb added
- [ ] Profiling data captured if performance-sensitive

### Security & Accessibility (if applicable)
- [ ] Security review passed (if auth/payment/PII touched)
- [ ] OWASP checklist passed (if API/endpoint changes)
- [ ] Accessibility audit passed (if UI changes: WCAG 2.1 AA)
- [ ] Secrets stored in env, not source code

---

<!-- Append this section just before the "Notes for Reviewers" line at the bottom of factory/.github/PULL_REQUEST_TEMPLATE.md -->

---

## ✅ Post-Merge Verification (within 60 seconds of merge)

The merger is responsible for this section. Subagents do not merge — see [AGENT_PROTOCOL.md](.github/AGENT_PROTOCOL.md).

- [ ] Deploy workflow(s) for the merge SHA queued (`deploy-frontend`, `deploy-workers`, or repo equivalent)
- [ ] Both deploys completed successfully (not just queued)
- [ ] Production smoke check returns expected response from the new SHA
- [ ] If anything failed: triggered `deploy-recovery.yml` or rolled back; did NOT start the next merge

If you skipped this section, you are inside the failure mode that broke main on May 1 2026. Don't.

---


## Notes for Reviewers

**If any box is unchecked but should be checked for this PR, request changes. Definition of Done is binary, not aspirational.**

**Helpful resources:**
- [Definition of Ready & Done Runbook](../docs/runbooks/definition-of-ready-done.md)
- [CLAUDE.md Standing Orders](../CLAUDE.md)
- [Package Dependency Order](../CLAUDE.md#package-dependency-order)
- [Hard Constraints](../CLAUDE.md#hard-constraints)

---

## Reviewer Checklist (Optional Comments)

_Add comments here to help the author understand what to prioritize. Remove this section if not needed._

- [ ]

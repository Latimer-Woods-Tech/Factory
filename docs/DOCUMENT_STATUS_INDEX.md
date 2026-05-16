# Document Status Index

**Last updated:** April 29, 2026  
**Purpose:** prevent stale planning artifacts from misleading future agents during the World Class 360 iteration.

---

## Status Legend

| Status | Meaning | Agent behavior |
|---|---|---|
| Canonical | Current source of truth | Read first; update when status changes |
| Active reference | Still useful and aligned | Use for implementation detail after canonical docs |
| Historical | Completed or superseded | Do not use as the active plan |
| Archive candidate | Likely outdated/no longer operational | Keep for record until coordinator archives |

---

## Canonical Documents

| Document | Status | Why it is canonical |
|---|---|---|
| `CLAUDE.md` | Canonical | Standing orders, stack constraints, verification requirements, package dependency order |
| `MASTER_INDEX.md` | Canonical | Entry point and source-of-truth routing |
| `WORLD_CLASS_IMPLEMENTATION_DASHBOARD.md` | Canonical | Parent open work register and coordination process |
| `docs/operations/WORLD_CLASS_360_TASK_DASHBOARD.md` | Canonical | Current iteration task board for World Class 360 execution |
| `docs/service-registry.yml` | Canonical | Worker/Page/package registry and rename safety source |
| `prompts/README.md` | Canonical | Active prompt index for agents |
| `prompts/AGENT_SUCCESS_CONTRACT.md` | Canonical | Agent execution contract |
| `prompts/PHASE_E_VIDEO_REVENUE_PROMPT.md` | Canonical | Video revenue execution prompt |
| `prompts/ADMIN_STUDIO_COMMAND_PLANE_PROMPT.md` | Canonical | Admin Studio safe command-plane prompt |
| `docs/revenue/PRACTITIONER_VIDEO_STUDIO_READY_STATE_PLAN.md` | Canonical | Practitioner Video Studio paid self-serve build plan |
| `docs/revenue/XICO_CITY_TRANCHE_REVIEW.md` | Canonical | Xico City fit, risk, and World Class 360 completion framing |
| `docs/architecture/XICO_CITY_LOW_LEVEL_ARCHITECTURE.md` | Canonical | Xico City low-level requirements, architecture, and ecosystem integration map |
| `docs/operations/WORLD_CLASS_360_SCOPE_GAP_REVIEW.md` | Canonical | Full-scope gap review covering apps, templates, standards, configs, and process maturity |
| `docs/operations/WORLD_CLASS_360_DISCIPLINE_BREAKDOWN.md` | Canonical | Discipline taxonomy and routing layer for W360 ownership/review gates |

---

## Active Reference Documents

| Document | Status | Use |
|---|---|---|
| `PROJECT_STATUS.md` | Active reference | High-level repo/package/app status; defer open work status to the dashboard |
| `docs/FACTORY_PACKAGE_MATRIX.md` | Active reference | Package capability mapping |
| `docs/APP_PLANNING_PATTERN.md` | Active reference | Planning template for app repos |
| `docs/admin-studio/00-MASTER-PLAN.md` | Active reference | Admin Studio product and safety model |
| `docs/SELFPRIME_VIDEOKING_SYNERGY_DEVELOPMENT_PLAN.md` | Active reference | Video/SelfPrime synergy detail; verify dates against dashboard |
| `docs/runbooks/deployment.md` | Active reference | Deploy and smoke verification process |
| `docs/runbooks/database.md` | Active reference | Neon and migration guidance |
| `docs/runbooks/github-secrets-and-tokens.md` | Active reference | Secret inventory and token conventions |
| `docs/runbooks/environment-isolation-and-verification.md` | Active reference | Environment safety and verification workflow |
| `docs/ENVIRONMENT_VERIFICATION_SETUP.md` | Active reference | App-level verification setup |
| `PHASE_6_CHECKLIST.md` | Active reference | Phase 6 provisioning checklist; verify against latest dashboard before action |

---

## Historical Documents

These documents are useful as delivery evidence but must not drive current work.

| Document / pattern | Status | Note |
|---|---|---|
| `*_COMPLETE.md` | Historical | Completion evidence only |
| `*_COMPLETION_SUMMARY.md` | Historical | Summary evidence only |
| `DELIVERY_COMPLETE.md` | Historical | Past delivery record |
| `DELIVERY_SUMMARY.md` | Historical | Past delivery record |
| `STAGE_0_COMPLETE.md` | Historical | Stage 0 record |
| `STAGE_5_COMPLETE.md` | Historical | Stage 5 record |
| `PHASE_D_COMPLETION_SUMMARY.md` | Historical | Past phase summary |
| `R2_PROVISIONING_COMPLETE.md` | Historical | R2 evidence; current open work lives in dashboard |
| `VIDEO_SECRETS_CONFIGURED.md` | Historical | Secret setup evidence; current verification lives in dashboard/runbooks |
| `BIRTHTIME_INPUT_IMPLEMENTATION_COMPLETE.md` | Historical | Completed implementation evidence |

---

## Archive Candidates

Do not delete automatically. Coordinator should review and either move to an archive folder or add a banner at the top stating that the file is historical.

| Document | Why it may be stale |
|---|---|
| `PHASE_6_READY_TO_EXECUTE.md` | Phase 6 infrastructure is already confirmed in later dashboard rows |
| `PHASE_6_7_READY_STATE.md` | Readiness state may be superseded by World Class 360 queue |
| `PHASE_6_7_TIMELINE.md` | Timeline may conflict with current W360 sequence |
| `PHASE_C_ACTIVATION_CHECKLIST.md` | Older phase checklist; verify against dashboard before use |
| `PHASE_C_EXECUTION_PLAYBOOK.md` | Older execution framing |
| `PHASE_C_KICKOFF_PACKAGE.md` | Older kickoff framing |
| `STAGE_1_FOUNDATION.md` | Stage document; not current active task board |
| `STAGE_6_ONWARDS_PLAN.md` | Superseded by current W360 queue for this iteration |
| `STAGES_2_5_AND_GUIDE.md` | Stage guide; historical unless dashboard references it |
| `FACTORY_STRATEGIC_REVIEW.md` | Strategy snapshot; may be superseded by W360 plan |
| `CAPABILITIES_ASSESSMENT.md` | Useful baseline but not current queue |
| `VIDEO_AUTOMATION_GAMEPLAN.md` | Verify against current video pipeline evidence before using |

---

## Agent Rule

When a document conflicts with the World Class 360 dashboard, follow this order:

1. `CLAUDE.md`
2. `WORLD_CLASS_IMPLEMENTATION_DASHBOARD.md`
3. `docs/operations/WORLD_CLASS_360_TASK_DASHBOARD.md`
4. `docs/service-registry.yml`
5. Active prompt files under `prompts/`
6. Active reference docs
7. Historical docs only as evidence

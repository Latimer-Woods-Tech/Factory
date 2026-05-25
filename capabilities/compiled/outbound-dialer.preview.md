# Capability Plan Preview — outbound-dialer

**Summary:** Outbound call-bank service pattern for compliant campaign dialing and disposition capture.

**Goal:** Provision a staging-first outbound calling service with lead targeting, consent-aware controls, and delivery telemetry.

## Packages

- analytics: @latimer-woods-tech/analytics (^0.2.0)
- compliance: @latimer-woods-tech/compliance (^0.3.0)
- crm: @latimer-woods-tech/crm (^0.3.0)
- telephony: @latimer-woods-tech/telephony (^0.3.0)

## Environment

- Secrets:
  - AI_GATEWAY_BASE_URL
  - ANTHROPIC_API_KEY
  - DEEPGRAM_API_KEY
  - ELEVENLABS_API_KEY
  - GROQ_API_KEY
  - JWT_SECRET
  - POSTHOG_KEY
  - TELNYX_API_KEY
  - VERTEX_ACCESS_TOKEN
  - VERTEX_LOCATION
  - VERTEX_PROJECT

- Vars:
  - ENVIRONMENT
  - WORKER_NAME

- Policy tags:
  - audit
  - communications
  - compliance
  - customer-data
  - observability
  - outbound-communications
  - outbound-sensitive
  - pii
  - telemetry
  - voice

## Bindings

- required: AUTH_RATE_LIMITER
- required: DB
- required: FLAG_TELEMETRY
- required: FLAGS

## Expected Surfaces

- /health
- /manifest
- /api/campaigns
- /api/campaigns/:id/start
- /api/dispositions

## Smoke Checks

- /health: expected 200, contains status
- /manifest: expected 200, contains manifestVersion

## Constraints

- Outbound dialing must not be provisioned without compliance and consent-aware auditability.
- Provisioning is staging-first; no direct production bootstrap path is supported.
- Generated service must expose /health and /manifest before promotion is allowed.

## Scaffold Contract

- entryScript: packages/deploy/scripts/scaffold.mjs
- stagingFirst: true
- requiredSecrets: JWT_SECRET
- requiredBindings: AUTH_RATE_LIMITER, DB, FLAG_TELEMETRY, FLAGS
- requiredVars: ENVIRONMENT, WORKER_NAME

## Implementation Notes

- This preview is the human-readable contract for the first golden path.
- It should be used to validate the compiled plan before provisioning.
- It is not a substitute for the true plan JSON contract.

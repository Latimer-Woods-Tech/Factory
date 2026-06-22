## [Unreleased]

## [0.3.0]

### Added
- **Stripe Connect (Express) onboarding helpers** — single source of truth for the connected-account flow shared by Capricast (creator payouts) and SelfPrime/HumanDesign (practitioner payouts):
  - `createConnectAccount()` — creates an Express account (card_payments + transfers) plus a hosted `account_onboarding` link, idempotency-keyed by a stable ref.
  - `createConnectOnboardingLink()` — fresh onboarding link to resume an incomplete account.
  - `getConnectAccountStatus()` — retrieves + normalizes an account.
  - `mapConnectAccount()` — pure Stripe.Account → `ConnectAccountStatus` mapper (active/restricted/pending/inactive + `ready` gate on charges+payouts+details).
  - `connectAccountFromEvent()` — pure mapper for `account.updated` webhook events.
  - `calculatePlatformFee()` — basis-point platform-fee math for destination charges.
- Types: `ConnectAccountStatus`, `ConnectOnboardingStatus`, and option/result interfaces for each helper.

> Per-batch transfer payouts (Capricast-only) are intentionally NOT abstracted here — they build on the existing `transferOrIdempotent` primitive.

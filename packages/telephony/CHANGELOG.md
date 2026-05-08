## [Unreleased]

## 0.3.0 — 2026-05-07

### Added
- `SynthesizeOptions.signal?: AbortSignal` — callers can now pass `AbortSignal.timeout(ms)` to the `synthesize()` function; the signal is forwarded directly to the underlying ElevenLabs `fetch` call so the HTTP connection is cancelled on expiry rather than leaving a dangling request.
- `isWithinCallingHours(ianaTimezone, nowUtc?)` — platform-safe helper (uses `Intl.DateTimeFormat`, no Node.js built-ins) that returns `true` when the local time in the given IANA timezone falls within the [08:00, 21:00] permitted calling window.
- `verifyTelnyxWebhook(payload, signature, publicKey)` — verifies a Telnyx Ed25519 webhook signature via the Web Crypto API (`crypto.subtle`); never throws, returns `false` on any error.
- `CallProvider` type — `'telnyx' | 'twilio'` union for tagging which telephony provider handled a call.

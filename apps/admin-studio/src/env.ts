/**
 * Worker bindings — declared here so every module gets typed access.
 * Secrets must be set via `wrangler secret put`, never in vars.
 */
export interface Env {
  // ── Vars (non-secret, in wrangler.jsonc) ──────────────────────────────────────────────
  STUDIO_ENV: 'local' | 'staging' | 'production';
  ALLOWED_ORIGINS: string;

  // ── Bindings ────────────────────────────────────────────────────────────────────────────────
  DB: Hyperdrive;
  /** Hyperdrive binding to THE_FACTORY Neon project for Command Center reads. */
  FACTORY_DB?: Hyperdrive;

  // ── Secrets (wrangler secret put) ───────────────────────────────────────────────────────────────────────
  /** Signing key for Studio-issued JWTs */
  JWT_SECRET: string;
  /** Shared bearer token admin-studio uses when calling schedule-worker via service binding */
  WORKER_API_TOKEN?: string;
  /** Bootstrap operator email allowed to obtain Studio JWTs. */
  STUDIO_ADMIN_EMAIL: string;
  /** Lowercase hex SHA-256 digest of the bootstrap operator password. */
  STUDIO_ADMIN_PASSWORD_SHA256: string;
  /** Legacy PAT fallback used when GitHub App credentials are unavailable. */
  GITHUB_TOKEN?: string;
  /** Anthropic API key for AI chat */
  ANTHROPIC_API_KEY: string;
  /** GCP service account key (base64-encoded JSON) for Secret Manager access */
  GCP_SA_KEY?: string;
  /** Grok fallback */
  XAI_API_KEY?: string;
  /** Groq fallback */
  GROQ_API_KEY?: string;
  /** DeepSeek bargain workbench for low-risk internal batch work */
  DEEPSEEK_API_KEY?: string;
  /** AI Gateway base URL (optional) */
  AI_GATEWAY_BASE_URL?: string;
  /** Vertex AI access token */
  VERTEX_ACCESS_TOKEN?: string;
  /** Vertex AI project ID */
  VERTEX_PROJECT?: string;
  /** Vertex AI location */
  VERTEX_LOCATION?: string;
  /** Google OAuth 2.0 client ID for /auth/google endpoint */
  GOOGLE_CLIENT_ID?: string;
  /** Required Google Workspace hosted domain for /auth/google, e.g. "latwoodtech.com". */
  STUDIO_GOOGLE_WORKSPACE_DOMAIN?: string;
  /** JSON map of Google users. Non-Workspace accounts also require allowExternal: true. */
  STUDIO_ALLOWED_USERS_JSON?: string;
  /** Sentry DSN for error reporting */
  SENTRY_DSN?: string;
  /** Slack webhook used by self-improvement loop critical alerts. */
  SLACK_WEBHOOK?: string;

  // ── Phase B: observability proxy secrets (all optional) ───────────────────────────────────────────────────────
  /** Cloudflare API token (Workers Scripts:Read) for deploy-version reads */
  CLOUDFLARE_API_TOKEN?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  /** Sentry user-auth token used to read recent issues */
  SENTRY_AUTH_TOKEN?: string;
  SENTRY_ORG?: string;
  SENTRY_PROJECT?: string;
  /** PostHog personal API key for HogQL queries */
  POSTHOG_API_KEY?: string;
  POSTHOG_PROJECT_ID?: string;
  POSTHOG_HOST?: string;

  // ── Phase C: test runner ──────────────────────────────────────────────────────────────────────────────────────
  /** Public origin of the Studio Worker — used as the GH Actions callback. */
  STUDIO_PUBLIC_URL?: string;
  /** Shared HMAC secret signed by the GH Action and verified by the Worker. */
  STUDIO_WEBHOOK_SECRET?: string;

  // ── Phase E: function catalog ────────────────────────────────────────────────────────────────────────────────────────
  /** Build SHA stamped at deploy time, surfaced in /manifest. */
  BUILD_SHA?: string;

  // ── Self-improvement loop ─────────────────────────────────────────────────────────────────────────────────────────
  /** Shared KV for monitor snapshots. */
  MONITOR_KV?: KVNamespace;
  /** Service binding to schedule-worker for /diagnostics + training-library proxy calls. */
  SCHEDULE_WORKER?: Fetcher;
  /** Flagship feature-flag binding. */
  FLAGS?: Fetcher;
  /** flag-meter D1 database for flag telemetry. */
  FLAG_TELEMETRY?: D1Database;

  // ── Stripe (read-only) ────────────────────────────────────────────────────────
  /** Stripe secret key — read-only GET access for the 12h revenue digest (see digest/collect.ts). */
  STRIPE_SECRET_KEY?: string;
  /** Stripe subscription webhook signing secret — Studio's own SaaS billing → entitlements. */
  STRIPE_SUBSCRIPTION_WEBHOOK_SECRET?: string;

  // ── Digest: 12-hour scheduled email + audio ─────────────────────────────────────────────────────────
  /** GitHub App ID for digest data collection. */
  FACTORY_APP_ID?: string;
  /** GitHub App private key (PEM) for JWT signing. */
  FACTORY_APP_PRIVATE_KEY?: string;
  /** GitHub App installation ID for the Latimer-Woods-Tech org. */
  FACTORY_APP_INSTALLATION_ID?: string;
  /** ElevenLabs API key for TTS audio generation. */
  ELEVENLABS_API_KEY?: string;
  /** ElevenLabs voice ID to use for digest narration. */
  ELEVENLABS_VOICE_DEFAULT?: string;
  /** Resend API key for email delivery. */
  RESEND_API_KEY?: string;
  /** Recipient email address for digest emails. Defaults to adrper79@gmail.com. */
  DIGEST_TO_EMAIL?: string;
  /** Public domain of the R2 bucket used to serve digest audio files. */
  R2_PUBLIC_DOMAIN?: string;
  /** R2 bucket binding for storing digest audio MP3 files. */
  DIGEST_R2?: R2Bucket;
  /** Optional factory-supervisor base URL for fetching last-run state. */
  SUPERVISOR_URL?: string;
  /** Bearer token for authenticating requests to the factory-supervisor API. */
  SUPERVISOR_API_KEY?: string;
}

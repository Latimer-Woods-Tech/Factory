/**
 * @latimer-woods-tech/flags — Type definitions
 */

/**
 * Flag naming convention: {scope}:{type_short}:{feature_name}
 * scope    = app name or 'global'
 * type_short = ks | ro | ex | cfg | ops
 * feature  = snake_case, no dates
 *
 * Examples:
 *   global:ks:supervisor_automerge
 *   humandesign:ro:profile_generate_v2
 *   videoking:cfg:moderation_thresholds
 */
export type FlagKey = string;

/** Evaluation context passed with every flag check. */
export interface FlagContext {
  /** Which app is making the evaluation. Must match the scope prefix in the key, or be 'global'. */
  app: string;
  env: 'production' | 'staging' | 'development';
  /** Stable user identifier for consistent bucketing in rollout/experiment flags. */
  userId?: string;
  /** Subscription plan for plan-based targeting. */
  plan?: 'free' | 'practitioner' | 'agency' | 'admin';
  /** Additional custom attributes for targeting rules. */
  attributes?: Record<string, string | number | boolean>;
}

/** Minimum Flagship binding shape (mirrors Cloudflare's official SDK). */
export interface FlagsbindingType {
  getBooleanValue(key: string, defaultValue: boolean, context?: Record<string, unknown>): Promise<boolean>;
  getStringValue(key: string, defaultValue: string, context?: Record<string, unknown>): Promise<string>;
  getNumberValue(key: string, defaultValue: number, context?: Record<string, unknown>): Promise<number>;
  getJSONValue<T = unknown>(key: string, defaultValue: T, context?: Record<string, unknown>): Promise<T>;
}

/** Worker env bindings required by this package. */
export interface FlagsEnv {
  /** Cloudflare Flagship binding (wrangler.jsonc: flagship: { binding: 'FLAGS' }). */
  FLAGS: FlagsbindingType;
  /** Optional D1 database for flag evaluation telemetry. Shared org-wide. */
  FLAG_TELEMETRY?: D1Database;
  /** Current deploy environment. */
  ENVIRONMENT: string;
}

/** Typed flag evaluation client scoped to an app + context. */
export interface FlagClient {
  /**
   * Evaluate a boolean flag.
   * @param key       Fully-qualified flag key: {scope}:{type}:{name}
   * @param fallback  Value returned if Flagship is unavailable.
   */
  boolean(key: FlagKey, fallback: boolean): Promise<boolean>;

  /** Evaluate a kill switch. Returns true when the system is operational (flag is on). */
  killSwitch(key: FlagKey): Promise<boolean>;

  /** Evaluate a string flag (ops overrides, experiment variants). */
  string(key: FlagKey, fallback: string): Promise<string>;

  /** Evaluate a number flag. */
  number(key: FlagKey, fallback: number): Promise<number>;

  /** Evaluate a JSON config flag. */
  json<T>(key: FlagKey, fallback: T): Promise<T>;
}

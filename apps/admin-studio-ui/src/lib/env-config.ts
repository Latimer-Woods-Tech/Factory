/**
 * Runtime environment resolution.
 *
 * The target environment (local / staging / production) is stored in
 * localStorage so it survives page reloads but can be changed without a
 * rebuild.  All API calls go through `getApiBase()` which reads this
 * stored value, giving operators a way to point the UI at a different
 * backend without touching build-time environment variables.
 */
import type { Environment } from '@latimer-woods-tech/studio-core';

/** Re-export so callers can import TargetEnv from this module alone. */
export type TargetEnv = Environment;

const ENV_STORAGE_KEY = 'admin_studio_env';

const ENV_API_BASES: Record<TargetEnv, string> = {
  local: (import.meta.env.VITE_API_BASE_LOCAL ?? 'http://localhost:8787/api').replace(/\/$/, ''),
  staging: (
    import.meta.env.VITE_API_BASE_STAGING ??
    import.meta.env.VITE_API_BASE ??
    '/api'
  ).replace(/\/$/, ''),
  production: (
    import.meta.env.VITE_API_BASE_PROD ??
    import.meta.env.VITE_API_BASE ??
    '/api'
  ).replace(/\/$/, ''),
};

/**
 * Returns the currently selected target environment.
 * Falls back to `'production'` if no value has been stored.
 */
export function getTargetEnv(): TargetEnv {
  const stored = localStorage.getItem(ENV_STORAGE_KEY);
  if (stored === 'local' || stored === 'staging' || stored === 'production') {
    return stored;
  }
  return 'production';
}

/**
 * Persists the chosen target environment to localStorage.
 * This takes effect on the *next* `getApiBase()` call — no reload required.
 */
export function setTargetEnv(env: TargetEnv): void {
  localStorage.setItem(ENV_STORAGE_KEY, env);
}

/**
 * Returns the API base URL for the currently selected environment.
 * Callers should invoke this per-request (not cache it) so that a
 * runtime env switch is picked up immediately.
 */
export function getApiBase(): string {
  return ENV_API_BASES[getTargetEnv()];
}

/**
 * Thin fetch wrapper. Adds JWT, request id, and forces logout for invalid session responses.
 */
import type { Environment } from '@latimer-woods-tech/studio-core';
import { useSession } from '../stores/session.js';

// Per-environment API base URLs — set at build time via Vite env vars.
const ENV_BASES: Record<Environment, string> = {
  local:      (import.meta.env.VITE_API_BASE_LOCAL      ?? '/api').replace(/\/$/, ''),
  staging:    (import.meta.env.VITE_API_BASE_STAGING    ?? '/api').replace(/\/$/, ''),
  production: (import.meta.env.VITE_API_BASE_PROD       ?? '/api').replace(/\/$/, ''),
};

/** Returns the base URL for the given or active session environment. */
export function getApiBase(env?: Environment | null): string {
  if (env) return ENV_BASES[env];
  const sessionEnv = useSession.getState().env;
  return sessionEnv ? ENV_BASES[sessionEnv] : '/api';
}

export function getApiUrl(path: string, env?: Environment | null): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${getApiBase(env)}${normalizedPath}`;
}

export interface ApiError extends Error {
  status: number;
  body: unknown;
}

export async function apiFetch<T = unknown>(
  path: string,
  init: RequestInit & { confirmed?: boolean; confirmToken?: string; dryRun?: boolean } = {},
): Promise<T> {
  const { token } = useSession.getState();
  const headers = new Headers(init.headers);

  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (init.confirmed) headers.set('X-Confirmed', 'true');
  if (init.confirmToken) headers.set('X-Confirm-Token', init.confirmToken);
  if (init.dryRun) headers.set('X-Dry-Run', 'true');
  headers.set('X-Request-Id', crypto.randomUUID());

  const res = await fetch(getApiUrl(path), { ...init, headers });

  const text = await res.text();
  const body = text ? safeJson(text) : null;

  if (res.status === 401 || isEnvironmentMismatch403(res.status, body)) {
    useSession.getState().logout();
  }

  if (!res.ok) {
    const err: ApiError = Object.assign(new Error(`API ${res.status}`), {
      status: res.status,
      body,
    });
    throw err;
  }

  return body as T;
}

function safeJson(text: string): unknown {
  try { return JSON.parse(text); } catch { return text; }
}

function isEnvironmentMismatch403(status: number, body: unknown): boolean {
  if (status !== 403 || !body || typeof body !== 'object') {
    return false;
  }

  const candidate = body as { error?: unknown; tokenEnv?: unknown };
  return candidate.error === 'Environment mismatch' && typeof candidate.tokenEnv === 'string';
}

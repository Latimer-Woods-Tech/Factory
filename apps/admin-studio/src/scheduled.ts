/**
 * Scheduled handlers for admin-studio cron triggers.
 *
 * runDriftCheck — fires on the 0 *\/6 * * * cron (every 6h).
 * Queries capability_services for entries whose last drift check is stale or
 * absent, fetches /{workerUrl}/manifest for each, hashes the response, and
 * records whether drift was detected.
 *
 * Uses Web Crypto API (no Node.js crypto) per the hard constraints in CLAUDE.md.
 */
import { createLogger } from '@latimer-woods-tech/logger';
import { listServices, touchServiceDriftCheck } from './lib/handoff-store.js';
import type { Env } from './env.js';

/** Re-check any service whose last check is older than this. */
const DRIFT_STALE_MS = 60 * 60 * 1000; // 1 hour

/**
 * Canonicalise a JSON value to a stable string for hashing.
 * Keys are sorted recursively — matches `jq -c -S '.'` output.
 */
function canonicalizeJson(value: unknown): string {
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalizeJson).join(',') + ']';
  }
  if (value !== null && typeof value === 'object') {
    const sorted = Object.keys(value as Record<string, unknown>)
      .sort()
      .map((k) => JSON.stringify(k) + ':' + canonicalizeJson((value as Record<string, unknown>)[k]));
    return '{' + sorted.join(',') + '}';
  }
  return JSON.stringify(value);
}

/** SHA-256 hex digest using the Web Crypto API. */
async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Fetch /manifest from a worker URL and return its canonical SHA-256 hash.
 * Returns null if the request fails or the response is not valid JSON.
 */
async function fetchManifestHash(workerUrl: string): Promise<string | null> {
  try {
    const resp = await fetch(`${workerUrl}/manifest`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) return null;
    const text = await resp.text();
    try {
      return await sha256Hex(canonicalizeJson(JSON.parse(text)));
    } catch {
      return await sha256Hex(text);
    }
  } catch {
    return null;
  }
}

/**
 * Drift check cron: query all services with stale or absent last_drift_check_at,
 * fetch their /manifest, compare hash with stored manifest_hash, record result.
 */
export async function runDriftCheck(env: Env): Promise<void> {
  const logger = createLogger({
    workerId: 'admin-studio',
    requestId: 'drift-cron',
    environment: env.STUDIO_ENV === 'production' ? 'production' : 'staging',
  });

  try {
    const allServices = await listServices(env.DB, { limit: 200 });
    const stale = allServices.filter((s) => {
      if (!s.workerUrl) return false;
      if (!s.lastDriftCheckAt) return true;
      return Date.now() - new Date(s.lastDriftCheckAt).getTime() > DRIFT_STALE_MS;
    });

    logger.info('drift-check.start', { staleCount: stale.length, totalCount: allServices.length });

    let okCount = 0;
    let driftCount = 0;
    let errorCount = 0;

    for (const service of stale) {
      try {
        const liveHash = await fetchManifestHash(service.workerUrl!);
        const driftDetected = liveHash === null || liveHash !== service.manifestHash;
        await touchServiceDriftCheck(env.DB, service.serviceId, {
          driftDetected,
          liveManifestHash: liveHash,
        });
        if (driftDetected) {
          driftCount += 1;
          logger.info('drift-check.drift', { serviceId: service.serviceId });
        } else {
          okCount += 1;
        }
      } catch (err) {
        logger.error('drift-check.service-error', err as Error, { serviceId: service.serviceId });
        errorCount += 1;
      }
    }

    logger.info('drift-check.complete', { okCount, driftCount, errorCount });
  } catch (err) {
    logger.error('drift-check.fatal', err as Error);
  }
}

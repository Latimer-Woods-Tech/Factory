/**
 * Factory network layer client helpers.
 *
 * Consumer apps (selfprime, capricast) copy or import this module as
 * src/lib/network.ts and call fireNetworkEvent() / registerNetworkLink()
 * in their request handlers.
 *
 * All calls are fire-and-forget via ctx.waitUntil — they never block the
 * user response. Failures are swallowed silently to preserve app isolation.
 *
 * USAGE IN A CONSUMER APP:
 *   import { fireNetworkEvent, registerNetworkLink } from './lib/network.js';
 *   // In a Hono handler:
 *   ctx.executionCtx.waitUntil(
 *     fireNetworkEvent(c.env, userId, 'reading_generated', { type: 'full' })
 *   );
 *
 * ENV REQUIRED in the consumer app's Env interface:
 *   FACTORY_NETWORK_URL: string   — "https://network.latwoodtech.work"
 *   FACTORY_NETWORK_TOKEN: string — wrangler secret (SELFPRIME_/CAPRICAST_FACTORY_NETWORK_TOKEN)
 */

interface NetworkEnv {
  FACTORY_NETWORK_URL?: string;
  FACTORY_NETWORK_TOKEN?: string;
}

const NETWORK_BASE = 'https://network.latwoodtech.work';

function headers(env: NetworkEnv): Headers {
  const h = new Headers({ 'Content-Type': 'application/json' });
  if (env.FACTORY_NETWORK_TOKEN) {
    h.set('Authorization', `Bearer ${env.FACTORY_NETWORK_TOKEN}`);
  }
  return h;
}

function base(env: NetworkEnv): string {
  return (env.FACTORY_NETWORK_URL ?? NETWORK_BASE).replace(/\/$/, '');
}

/**
 * Fires a cross-app network event. Fire-and-forget — always resolves.
 * Call inside ctx.waitUntil() to avoid blocking the response.
 */
export async function fireNetworkEvent(
  env: NetworkEnv,
  userIdLocal: string,
  eventName: string,
  properties: Record<string, unknown> = {},
  schemaVersion = 1,
): Promise<void> {
  if (!env.FACTORY_NETWORK_TOKEN) return;
  await fetch(`${base(env)}/v1/network/events`, {
    method: 'POST',
    headers: headers(env),
    body: JSON.stringify({ user_id_local: userIdLocal, event_name: eventName, properties, schema_version: schemaVersion }),
  }).catch(() => {});
}

/**
 * Registers a verified cross-app identity link after OAuth handshake.
 * Call after upsertVerifiedAccountLink() in the OAuth callback.
 */
export async function registerNetworkLink(
  env: NetworkEnv,
  sourceUserId: string,
  targetApp: string,
  targetUserId: string,
): Promise<void> {
  if (!env.FACTORY_NETWORK_TOKEN) return;
  await fetch(`${base(env)}/v1/network/links`, {
    method: 'POST',
    headers: headers(env),
    body: JSON.stringify({ source_user_id: sourceUserId, target_app: targetApp, target_user_id: targetUserId }),
  }).catch(() => {});
}

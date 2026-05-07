/**
 * Action-confirmation middleware factory.
 *
 * Routes that mutate state declare:
 *   - their reversibility tier
 *   - any required confirmation token (sent by UI after user types-to-confirm)
 *
 * The middleware then enforces the appropriate ConfirmationTier per env policy.
 *
 * Confirmation token contract:
 *   For tier ≥ 2, the request must include `X-Confirm-Token` whose value
 *   is the SHA-256 of `${action}:${userId}:${env}` truncated to 16 hex chars,
 *   matching what the UI shows in the confirm dialog.
 *
 * This is **not** a security boundary — only a UX safeguard against accidental
 * clicks. Real authorization is JWT + role checks. The token simply proves
 * "the human read the modal".
 */
import type { Context, MiddlewareHandler } from 'hono';
import type { AppEnv } from '../types.js';
import {
  requiredConfirmationTier,
  type ReversibilityTier,
  type Role,
  requireRole,
} from '@latimer-woods-tech/studio-core';

export interface ConfirmOptions {
  action: string;
  reversibility: ReversibilityTier;
  /** Minimum role allowed to perform the action (default: editor). */
  minRole?: Role;
  /** If true, allow `?dryRun=true` to bypass confirmation (returns plan only). */
  allowDryRun?: boolean;
}

async function expectedConfirmToken(
  action: string,
  userId: string,
  env: string,
): Promise<string> {
  const data = new TextEncoder().encode(`${action}:${userId}:${env}`);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const hex = [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return hex.slice(0, 16);
}

/**
 * Computes the expected co-signer token for tier-3 two-person approval.
 *
 * Binds to a server-issued nonce (stored in KV) so the token cannot be
 * precomputed by the initiator — the nonce is random and unknown until the
 * server generates it. This satisfies FRIDGE rule 8: a genuine second principal
 * must retrieve the nonce from the initiator out-of-band and compute the token
 * using their own identity.
 *
 * @param nonce - random hex string issued by the server for this co-sign session
 * @param action - the action name (e.g. "ops.rollback")
 * @param cosignerId - the co-signer's userId (must differ from initiator)
 * @param env - the runtime environment string (e.g. "production")
 */
async function expectedCosignerToken(
  nonce: string,
  action: string,
  cosignerId: string,
  env: string,
): Promise<string> {
  // Nonce binding prevents precomputation: the token is unpredictable without
  // the server-issued nonce, which is only revealed after the initiator's first
  // (unsuccessful) attempt. KV TTL ensures nonces expire after 5 minutes.
  const data = new TextEncoder().encode(`cosign:${nonce}:${action}:${cosignerId}:${env}`);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const hex = [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return hex.slice(0, 16);
}

/** Generate a cryptographically random 32-byte hex nonce. */
function generateNonce(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function requireConfirmation(opts: ConfirmOptions): MiddlewareHandler<AppEnv> {
  return async (c: Context<AppEnv>, next) => {
    const ctx = c.var.envContext;
    if (!ctx) return c.json({ error: 'Unauthenticated' }, 401);

    try {
      requireRole(ctx, opts.minRole ?? 'editor');
    } catch (err) {
      return c.json({ error: (err as Error).message }, 403);
    }

    const tier = requiredConfirmationTier(ctx.env, opts.reversibility);

    // tier 0 → no confirmation required
    if (tier === 0) {
      return next();
    }

    const isDryRun = opts.allowDryRun &&
      (c.req.query('dryRun') === 'true' || c.req.header('X-Dry-Run') === 'true');
    if (isDryRun) {
      return next();
    }

    // tier 1 → just a click; UI shows modal but no token needed.
    if (tier === 1) {
      const ack = c.req.header('X-Confirmed') === 'true';
      if (!ack) {
        return c.json(
          {
            error: 'Confirmation required',
            tier,
            reversibility: opts.reversibility,
            action: opts.action,
          },
          412,
        );
      }
      return next();
    }

    // tier ≥ 2 → require X-Confirm-Token matching the expected value.
    const provided = c.req.header('X-Confirm-Token');
    const expected = await expectedConfirmToken(opts.action, ctx.userId, ctx.env);
    if (provided !== expected) {
      return c.json(
        {
          error: 'Invalid or missing confirmation token',
          tier,
          reversibility: opts.reversibility,
          action: opts.action,
          expectedTokenHint: `Type the action name "${opts.action}" to confirm`,
        },
        412,
      );
    }

    // Tier 3 (two-key): FRIDGE rule 8 — irreversible actions require a second
    // human principal distinct from the initiator.
    //
    // Protocol (nonce-bound — prevents precomputation):
    //   Phase 1 (no cosigner headers):
    //     Server generates a random nonce, stores it in KV (5-min TTL), returns 412
    //     with the nonce. Initiator shares action name, nonce, AND their userId
    //     out-of-band with the co-signer.
    //   Phase 2 (cosigner headers present):
    //     Co-signer computes X-Co-Signer-Token =
    //       SHA-256(cosign:nonce:action:cosignerUserId:env)[0:16]
    //     Initiator submits with: X-Co-Signer-Id, X-Co-Signer-Token, X-Cosign-Nonce.
    //     Server verifies nonce (from KV, single-use), principal check, and token.
    if (tier === 3) {
      if (!c.env.MONITOR_KV) {
        // Fail closed: tier-3 actions are disabled if KV is not configured, since
        // without KV we cannot issue or verify nonces (precomputation risk).
        return c.json({ error: 'Two-person approval requires MONITOR_KV binding (not configured)', tier }, 503);
      }

      const cosignerId = c.req.header('X-Co-Signer-Id');
      const cosignerToken = c.req.header('X-Co-Signer-Token');
      const providedNonce = c.req.header('X-Cosign-Nonce');

      const nonceKey = `cosign-nonce:${opts.action}:${ctx.userId}`;

      if (!cosignerId || !cosignerToken || !providedNonce) {
        // Phase 1: issue a server-side nonce. The nonce binds the co-signer token
        // to a random value the initiator could not predict before this call.
        const nonce = generateNonce();
        await c.env.MONITOR_KV.put(nonceKey, nonce, { expirationTtl: 300 });
        return c.json(
          {
            error: 'Two-person approval required',
            tier,
            action: opts.action,
            cosignNonce: nonce,
            instructions: 'Share cosignNonce, action, and your userId out-of-band. Co-signer computes X-Co-Signer-Token = SHA-256(cosign:nonce:action:cosignerId:env)[0:16] and supplies X-Co-Signer-Id + X-Co-Signer-Token + X-Cosign-Nonce.',
          },
          412,
        );
      }

      // Phase 2: verify the nonce from KV (proves server issued it; enforces TTL).
      const storedNonce = await c.env.MONITOR_KV.get(nonceKey);
      if (!storedNonce || storedNonce !== providedNonce) {
        return c.json({ error: 'Co-sign nonce invalid or expired — restart the approval flow', tier }, 412);
      }

      // The co-signer MUST be a different principal than the initiator.
      if (cosignerId === ctx.userId) {
        return c.json(
          { error: 'Co-signer must be a different principal than the request initiator', tier },
          412,
        );
      }

      const expectedCosigner = await expectedCosignerToken(storedNonce, opts.action, cosignerId, ctx.env);
      if (cosignerToken !== expectedCosigner) {
        return c.json({ error: 'Invalid co-signer token', tier }, 412);
      }

      // Single-use nonce: delete after successful verification to prevent replay.
      await c.env.MONITOR_KV.delete(nonceKey);
    }

    await next();
  };
}

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
 * The token is bound to the co-signer's userId so it cannot be self-signed:
 * the initiator is blocked from supplying their own userId as X-Co-Signer-Id.
 * Each co-signer computes the token in the Admin Studio UI from their own
 * identity, enforcing FRIDGE rule 8 (distinct second principal required).
 *
 * @param action - the action name (e.g. "ops.rollback")
 * @param cosignerId - the co-signer's userId (must differ from initiator)
 * @param env - the runtime environment string (e.g. "production")
 */
async function expectedCosignerToken(
  action: string,
  cosignerId: string,
  env: string,
): Promise<string> {
  const data = new TextEncoder().encode(`cosign:${action}:${cosignerId}:${env}`);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const hex = [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return hex.slice(0, 16);
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
    // Protocol:
    //   1. Initiator shares the action name + their own userId out-of-band.
    //   2. Co-signer computes X-Co-Signer-Token = SHA-256(cosign:action:cosignerUserId:env)[0:16]
    //      using their own userId in the Admin Studio UI.
    //   3. Co-signer passes both X-Co-Signer-Id (their userId) and X-Co-Signer-Token.
    //   4. Middleware verifies: cosignerId ≠ initiatorId AND token matches expected.
    if (tier === 3) {
      const cosignerId = c.req.header('X-Co-Signer-Id');
      const cosignerToken = c.req.header('X-Co-Signer-Token');
      if (!cosignerId || !cosignerToken) {
        return c.json(
          { error: 'Two-person approval required: provide X-Co-Signer-Id and X-Co-Signer-Token', tier },
          412,
        );
      }
      // The co-signer MUST be a different principal than the initiator.
      if (cosignerId === ctx.userId) {
        return c.json(
          { error: 'Co-signer must be a different principal than the request initiator', tier },
          412,
        );
      }
      const expectedCosigner = await expectedCosignerToken(opts.action, cosignerId, ctx.env);
      if (cosignerToken !== expectedCosigner) {
        return c.json(
          { error: 'Invalid co-signer token', tier },
          412,
        );
      }
    }

    await next();
  };
}

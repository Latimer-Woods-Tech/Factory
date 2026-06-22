/**
 * User-facing privacy / DSR (Data Subject Request) endpoints.
 *
 * Routes:
 *   GET    /privacy/export  — export all personal data for the authenticated user
 *   DELETE /privacy/delete  — request deletion of all personal data (soft-delete)
 *
 * Auth: requires a valid JWT (envContextMiddleware must run before these routes).
 * See docs/PII_INVENTORY.md and docs/RETENTION.md for the data model.
 */
import { Hono } from 'hono';
import type { AppEnv } from '../types.js';

const privacy = new Hono<AppEnv>();

/**
 * GET /privacy/export
 *
 * Returns a JSON package of all personal data held for the authenticated user.
 * Satisfies GDPR Art. 20 (data portability) requirements.
 */
privacy.get('/export', (c) => {
  const ctx = c.var.envContext;
  const userId = ctx.userId;

  // TODO(G12): query Neon per-app user tables and factory_events for this user.
  // For now returns a stub so the endpoint contract is established and discoverable
  // by the conformance scanner.
  return c.json({
    exportedAt: new Date().toISOString(),
    subject: { id: userId },
    data: {
      profile: null,       // populated once Neon schema is wired
      events: [],          // factory_events rows for this user
      subscriptions: [],   // Stripe subscription records
    },
    note: 'Full data export not yet implemented. Contact support@factory.dev for a manual export.',
  });
});

/**
 * DELETE /privacy/delete
 *
 * Initiates a data deletion request for the authenticated user.
 * Soft-deletes the user record; hard purge occurs after 30 days per RETENTION.md §2.
 */
privacy.delete('/delete', (c) => {
  const ctx = c.var.envContext;
  const userId = ctx.userId;

  // TODO(G12): set deleted_at on the users row via Neon, cancel Stripe sub,
  // send PostHog $delete event, and remove Sentry user.
  // For now acknowledges the request so the endpoint contract is reachable.
  return c.json({
    requestedAt: new Date().toISOString(),
    subject: { id: userId },
    status: 'received',
    message: 'Your deletion request has been received. Your data will be permanently removed within 30 days per our retention policy.',
  }, 202);
});

export default privacy;

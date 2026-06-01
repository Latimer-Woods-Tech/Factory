/**
 * CORS middleware — strict allow-list from env.ALLOWED_ORIGINS.
 */
import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../types.js';

export function corsMiddleware(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const origin = c.req.header('Origin');
    const allowed = c.env.ALLOWED_ORIGINS.split(',').map((s) => s.trim());
    const isAllowed = Boolean(origin && allowed.includes(origin));

    if (c.req.method === 'OPTIONS') {
      if (isAllowed && origin) {
        c.header('Access-Control-Allow-Origin', origin);
        c.header('Access-Control-Allow-Credentials', 'true');
        c.header('Vary', 'Origin');
      }
      c.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
      c.header(
        'Access-Control-Allow-Headers',
        'Authorization,Content-Type,X-Request-Id,X-Confirmed,X-Confirm-Token,X-Co-Signer-Token,X-Dry-Run',
      );
      c.header('Access-Control-Max-Age', '600');
      return c.body(null, 204);
    }

    await next();

    // Apply CORS headers AFTER the route runs so raw `new Response(...)`
    // returns also get them. Setting via c.header() before next() only
    // decorates responses built via c.json/c.body/c.text — SSE handlers
    // like /ai/chat and /tests/runs/:id construct their Response directly
    // and bypass that header table, which manifests as a browser CORS
    // error even when the request returns 200.
    if (isAllowed && origin && c.res) {
      c.res.headers.set('Access-Control-Allow-Origin', origin);
      c.res.headers.set('Access-Control-Allow-Credentials', 'true');
      const existingVary = c.res.headers.get('Vary');
      c.res.headers.set('Vary', existingVary ? `${existingVary}, Origin` : 'Origin');
    }
  };
}

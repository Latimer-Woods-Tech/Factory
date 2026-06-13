/**
 * factory-core-api — Worker entrypoint (Admin Build Plan P1.1).
 *
 * Phase A walking skeleton for the read-layer ingestion API. Exposes the two
 * mandatory operational routes (`/health`, `/version`) plus the OIDC->JWT token
 * exchange (`/v1/auth/token`) that every later ingestion path authenticates
 * against. Observability is wired from this first PR: Sentry via
 * `@latimer-woods-tech/monitoring` and structured logs via
 * `@latimer-woods-tech/logger`.
 *
 * @see docs/architecture/ADMIN_TECHNICAL_GUIDE.md §1.5, §2.0
 * @see docs/architecture/ADMIN_BUILD_PLAN.md §2 (P1.1)
 */
import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import {
  AuthError,
  BadRequestError,
  InternalError,
  toErrorResponse,
} from '@latimer-woods-tech/errors';
import {
  createLogger,
  generateRequestId,
  requestTracingMiddleware,
} from '@latimer-woods-tech/logger';
import { captureError, initMonitoring } from '@latimer-woods-tech/monitoring';
import type { MonitoringEnvironment } from '@latimer-woods-tech/monitoring';
import type { Env } from './env.js';
import { verifyGithubOidcToken } from './oidc.js';
import { isAllowedAudience, signScopedToken } from './jwt.js';
import { createGatesRouter } from './routes/gates.js';
import { createArtifactsRouter } from './routes/artifacts.js';
import { createRunsMirrorRouter } from './routes/runs.js';
import { createAuditRouter } from './routes/audit.js';
import { createNetworkRouter } from './routes/network.js';

const SERVICE = 'factory-core-api';
const DEFAULT_OIDC_ISSUER = 'https://token.actions.githubusercontent.com';
const DEFAULT_GITHUB_OWNER = 'Latimer-Woods-Tech';
const SCOPED_TOKEN_TTL_SECONDS = 600;

function resolveEnvironment(value: string | undefined): MonitoringEnvironment {
  return value === 'production' ? 'production' : value === 'staging' ? 'staging' : 'development';
}

const app = new Hono<{ Bindings: Env }>();

const requestTracing = requestTracingMiddleware() as unknown as MiddlewareHandler<{ Bindings: Env }>;
app.use('*', requestTracing);

// Initialise Sentry on the first request that exposes SENTRY_DSN, then every
// subsequent request runs inside the configured scope. initMonitoring is
// idempotent; the worker still boots when the secret is absent (local dev).
let sentryInitialized = false;
app.use('*', async (c, next) => {
  if (c.env.SENTRY_DSN && !sentryInitialized) {
    initMonitoring({
      dsn: c.env.SENTRY_DSN,
      environment: resolveEnvironment(c.env.ENVIRONMENT),
      release: c.env.BUILD_SHA,
    });
    sentryInitialized = true;
  }
  await next();
});

/** GET /health — unauthenticated liveness probe (CLAUDE.md verification protocol). */
app.get('/health', (c) =>
  c.json({
    status: 'ok',
    service: SERVICE,
    env: c.env.ENVIRONMENT ?? 'development',
    ts: new Date().toISOString(),
  }),
);

/** GET /version — reports the deployed commit SHA. */
app.get('/version', (c) =>
  c.json({
    service: SERVICE,
    sha: c.env.BUILD_SHA ?? 'dev',
    ts: new Date().toISOString(),
  }),
);

/**
 * POST /v1/auth/token — exchanges a GitHub Actions OIDC token for a short-lived
 * scoped JWT. The caller sends its OIDC token as a Bearer credential and the
 * requested ingestion scope in the body: `{ "audience": "gates-ci" }`.
 */
app.post('/v1/auth/token', async (c) => {
  const requestId = c.get('requestId') ?? generateRequestId();
  const log = createLogger({
    workerId: SERVICE,
    requestId,
    environment: resolveEnvironment(c.env.ENVIRONMENT),
  });

  const signingKey = c.env.JWT_SIGNING_KEY;
  if (!signingKey) {
    throw new InternalError('Token signing key is not configured');
  }

  const authorization = c.req.header('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    throw new AuthError('Missing OIDC bearer token');
  }
  const oidcToken = authorization.slice(7).trim();
  if (!oidcToken) {
    throw new AuthError('Missing OIDC bearer token');
  }

  const body = (await c.req.json().catch(() => null)) as { audience?: unknown } | null;
  const audience = typeof body?.audience === 'string' ? body.audience : '';
  if (!audience) {
    throw new BadRequestError('Request body must include an "audience" string');
  }
  if (!isAllowedAudience(audience)) {
    throw new BadRequestError(`Audience "${audience}" is not an allowed ingestion scope`);
  }

  const claims = await verifyGithubOidcToken(oidcToken, {
    issuer: c.env.OIDC_ISSUER ?? DEFAULT_OIDC_ISSUER,
    audience: c.env.OIDC_AUDIENCE ?? SERVICE,
    owner: c.env.GITHUB_OWNER ?? DEFAULT_GITHUB_OWNER,
  });

  const { token, expiresIn } = await signScopedToken(
    {
      iss: SERVICE,
      sub: claims.sub,
      aud: audience,
      repository: claims.repository,
      repository_owner: claims.repository_owner,
    },
    signingKey,
    SCOPED_TOKEN_TTL_SECONDS,
  );

  log.info('Minted scoped token', {
    audience,
    repository: claims.repository,
    subject: claims.sub,
  });

  return c.json({
    token,
    token_type: 'Bearer',
    audience,
    expires_in: expiresIn,
    subject: claims.sub,
  });
});

app.route('/v1/gates', createGatesRouter());
app.route('/v1/artifacts', createArtifactsRouter());
app.route('/v1/runs/mirror', createRunsMirrorRouter());
app.route('/v1/audit', createAuditRouter());
app.route('/v1/network', createNetworkRouter());

app.notFound((c) => c.json({ error: 'Not found', path: c.req.path }, 404));

app.onError((err, c) => {
  const requestId = c.get('requestId');
  const tracedId = typeof requestId === 'string' ? requestId : undefined;
  if (c.env.SENTRY_DSN) {
    captureError(err, { requestId: tracedId });
  } else {
    createLogger({
      workerId: SERVICE,
      requestId: tracedId ?? 'unknown',
      environment: resolveEnvironment(c.env.ENVIRONMENT),
    }).error('factory-core-api.error', err, { path: c.req.path, method: c.req.method });
  }
  const response = toErrorResponse(err, tracedId);
  const status = (response.error?.status ?? 500) as ContentfulStatusCode;
  return c.json(response, status);
});

export default app;

import { captureError } from '@latimer-woods-tech/monitoring';
import type { MiddlewareHandler } from 'hono';

declare module 'hono' {
  interface ContextVariableMap {
    logger: Logger;
    requestId: string;
  }
}

/**
 * Structured logger context.
 */
export interface LogContext {
  workerId: string;
  requestId: string;
  userId?: string;
  tenantId?: string;
  environment?: 'development' | 'staging' | 'production';
  [key: string]: unknown;
}

/**
 * Structured logger interface.
 */
export interface Logger {
  info(msg: string, ctx?: Record<string, unknown>): void;
  warn(msg: string, ctx?: Record<string, unknown>): void;
  error(msg: string, err?: unknown, ctx?: Record<string, unknown>): void;
  debug(msg: string, ctx?: Record<string, unknown>): void;
  child(ctx: Partial<LogContext>): Logger;
}

type LogLevel = 'debug' | 'info' | 'warn' | 'error';
const reportCapturedError = captureError as (err: unknown, context?: {
  userId?: string;
  tenantId?: string;
  requestId?: string;
  extra?: Record<string, unknown>;
}) => string;

function emit(level: LogLevel, msg: string, context: LogContext, extra?: Record<string, unknown>): void {
  if (level === 'debug' && context.environment === 'production') {
    return;
  }

  console.log(
    JSON.stringify({
      level,
      msg,
      ts: new Date().toISOString(),
      ...context,
      ...extra,
      workerId: context.workerId,
      requestId: context.requestId,
    }),
  );
}

/**
 * Creates a structured JSON logger.
 */
export function createLogger(ctx: LogContext): Logger {
  const baseContext: LogContext = { ...ctx };

  return {
    info(msg, extra) {
      emit('info', msg, baseContext, extra);
    },
    warn(msg, extra) {
      emit('warn', msg, baseContext, extra);
    },
    error(msg, err, extra) {
      if (err !== undefined) {
        reportCapturedError(err, {
          requestId: baseContext.requestId,
          userId: typeof baseContext.userId === 'string' ? baseContext.userId : undefined,
          tenantId:
            typeof baseContext.tenantId === 'string' ? baseContext.tenantId : undefined,
          extra,
        });
      }

      const errorContext =
        err instanceof Error
          ? {
              errorMessage: err.message,
              errorName: err.name,
            }
          : err === undefined
            ? undefined
            : { error: err };

      emit('error', msg, baseContext, {
        ...errorContext,
        ...extra,
      });
    },
    debug(msg, extra) {
      emit('debug', msg, baseContext, extra);
    },
    child(extraContext) {
      return createLogger({
        ...baseContext,
        ...extraContext,
      });
    },
  };
}

/**
 * Adds a request id and bound logger to the current Hono context.
 */
export function withRequestId(): MiddlewareHandler {
  return async (c, next) => {
    const requestId = crypto.randomUUID();
    const workerIdHeader = c.req.header('x-worker-id');
    const logger = createLogger({
      workerId: workerIdHeader ?? 'unknown-worker',
      requestId,
    });

    c.set('requestId', requestId);
    c.set('logger', logger);

    await next();
  };
}

// Re-export correlation ID utilities for full-stack tracing
export {
  correlationIdMiddleware,
  generateCorrelationId,
  getCorrelationId,
  createQueryContext,
  type QueryContext,
} from './correlation';

/**
 * Generates a short, URL-safe request-correlation ID.
 *
 * 12 hex characters = 48 bits of entropy — sufficient for per-request
 * deduplication. Useful in vanilla Cloudflare Workers and cron handlers where
 * the Hono {@link withRequestId} middleware is not available.
 *
 * @returns A 12-character lowercase hex string, e.g. `"a3f1c9e20b4d"`.
 *
 * @example
 * const requestId = generateRequestId();
 * const log = createLogger({ workerId: 'prime-self-api', requestId });
 */
export function generateRequestId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Truncates an opaque ID to its first 8 characters for inclusion in log fields.
 *
 * Per policy CTO-012 / CISO-008: user IDs and subscription IDs must not appear
 * in full in Cloudflare Tail Workers or Logpush output because log retention
 * creates a GDPR-adjacent audit trail. Eight characters of a UUID provide
 * sufficient log correlation without enabling PII re-identification.
 *
 * Full IDs remain in the database and must never appear in log lines.
 *
 * @param id - UUID, Stripe ID, or similar opaque identifier.
 * @returns First 8 characters followed by `"…"`, or the original string when
 *   it is 8 characters or shorter. Returns an empty string for `null` or
 *   `undefined` inputs.
 *
 * @example
 * sanitizeId('a3b4c5d6-1234-5678-abcd-ef0123456789') // 'a3b4c5d6…'
 * sanitizeId('short')                                  // 'short'
 * sanitizeId(null)                                     // ''
 */
export function sanitizeId(id: string | null | undefined): string {
  if (!id || typeof id !== 'string') return '';
  return id.length > 8 ? id.slice(0, 8) + '\u2026' : id;
}

/**
 * Hono middleware that propagates or mints an `x-request-id` header for
 * distributed tracing. Reads the incoming `x-request-id` header (forwarded
 * by upstream services) or generates a new UUID when absent. Stores the ID
 * in Hono context (`c.get('requestId')`) and echoes it in the response header
 * so downstream consumers can correlate log lines across service hops.
 *
 * @returns A typed Hono `MiddlewareHandler` compatible with any `Bindings` shape.
 *
 * @example
 * app.use('*', requestTracingMiddleware());
 */
export function requestTracingMiddleware<
  E extends { Bindings: Record<string, unknown> } = { Bindings: Record<string, unknown> },
>(): MiddlewareHandler<E> {
  return async (c, next) => {
    const id = c.req.header('x-request-id') ?? crypto.randomUUID();
    c.set('requestId', id as never);
    await next();
    c.res.headers.set('x-request-id', id);
  };
}

/**
 * Reads the `requestId` stored by {@link requestTracingMiddleware} from the
 * current Hono context.
 *
 * @param c - Hono context (or any object with a typed `get` accessor).
 * @returns The request-correlation ID, or `undefined` if the middleware has
 *   not run yet.
 */
export function getRequestId(c: { get(key: 'requestId'): string | undefined }): string | undefined {
  return c.get('requestId');
}

/**
 * Returns a `fetch`-compatible function that automatically attaches
 * `x-request-id: <requestId>` to every outbound request, enabling
 * end-to-end tracing across Worker-to-Worker calls.
 *
 * @param requestId - The correlation ID from the current request context.
 * @param baseFetch - Override for the global `fetch` (useful in tests).
 * @returns A drop-in replacement for `fetch` with the tracing header injected.
 *
 * @example
 * const tfetch = tracedFetch(getRequestId(c) ?? crypto.randomUUID());
 * const resp = await tfetch('https://other-service.adrper79.workers.dev/api/data');
 */
export function tracedFetch(requestId: string, baseFetch: typeof fetch = fetch): typeof fetch {
  return (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set('x-request-id', requestId);
    return baseFetch(input, { ...init, headers });
  };
}

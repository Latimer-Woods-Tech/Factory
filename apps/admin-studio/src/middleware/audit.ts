/**
 * Audit middleware — captures every mutating request into studio_audit_log.
 *
 * Skips GET/HEAD/OPTIONS. Redacts secrets from payload before insert.
 * Phase B: persists via @latimer-woods-tech/neon. Insert failures are logged
 * but never block the response (defence-in-depth: audit infra outage
 * must not 5xx user traffic).
 */
import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../types.js';
import { createLogger } from '@latimer-woods-tech/logger';
import { redactSecrets, type AuditEntry } from '@latimer-woods-tech/studio-core';
import { insertAuditEntry } from '../lib/audit-store.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function auditMiddleware(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (SAFE_METHODS.has(c.req.method)) {
      return next();
    }

    const ctx = c.var.envContext;
    if (!ctx) {
      // No identity — auth failed elsewhere, nothing to audit.
      return next();
    }

    let payload: Record<string, unknown> = {};
    try {
      const cloned = c.req.raw.clone();
      const text = await cloned.text();
      if (text) {
        const parsed: unknown = JSON.parse(text);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          payload = redactSecrets(parsed as Record<string, unknown>);
        }
      }
    } catch {
      // Non-JSON body (form upload, etc.) — log empty payload.
    }

    let result: AuditEntry['result'] = 'success';
    let resultDetail: Record<string, unknown> | undefined;
    try {
      await next();
      if (c.res.status >= 400) {
        result = 'failure';
        resultDetail = { status: c.res.status };
      }
    } catch (err) {
      result = 'failure';
      resultDetail = { error: (err as Error).message };
      throw err;
    } finally {
      // Routes may enrich the audit entry by setting auditAction / auditResource /
      // auditReversibility / auditResultDetail on the context. This lets routes
      // produce semantically correct entries (e.g. 'smoke.run') without creating
      // duplicate rows on top of the middleware's generic entry.
      const entry: AuditEntry = {
        id: crypto.randomUUID(),
        occurredAt: new Date().toISOString(),
        userId: ctx.userId,
        userEmail: ctx.userEmail,
        userRole: ctx.role,
        sessionId: ctx.sessionId,
        env: ctx.env,
        action: c.var.auditAction ?? `${c.req.method} ${new URL(c.req.url).pathname}`,
        resource: c.var.auditResource,
        resourceId: c.var.auditResourceId,
        reversibility: c.var.auditReversibility ?? 'reversible',
        payload,
        result,
        // Route-level detail takes precedence over HTTP-status-derived detail.
        resultDetail: c.var.auditResultDetail ?? resultDetail,
        ipAddress: c.req.header('CF-Connecting-IP') ?? c.req.header('X-Forwarded-For'),
        userAgent: c.req.header('User-Agent'),
        requestId: c.var.requestId ?? crypto.randomUUID(),
      };

      const auditLogger = createLogger({
        workerId: 'admin-studio-audit',
        requestId: entry.requestId,
      });
      auditLogger.info('audit_entry', {
        event: 'audit.write',
        request_id: entry.requestId,
        action: entry.action,
        resource: entry.resource,
        result: entry.result,
      });

      // Best-effort DB insert. Use waitUntil when available so we don't
      // hold the response open. Hono exposes the executionCtx via c.executionCtx.
      const writePromise = insertAuditEntry(c.env.DB, entry);
      // c.executionCtx throws when no ExecutionContext is bound (e.g. Vitest).
      // Guard with try-catch so test suites don't crash on audit writes.
      let exec: ExecutionContext | undefined;
      try { exec = c.executionCtx; } catch { /* no-op — not available in test */ }
      if (exec && typeof exec.waitUntil === 'function') {
        exec.waitUntil(writePromise);
      } else {
        // Fall back to await — we still swallow inside insertAuditEntry.
        await writePromise;
      }
    }
  };
}

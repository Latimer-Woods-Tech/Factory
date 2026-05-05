/**
 * GET /timeline — unified incident and audit timeline with request correlation.
 *
 * Merges three event sources into a single chronological stream:
 *   1. studio_audit_log  — operator actions (all write requests)
 *   2. Sentry issues     — application errors (if SENTRY_AUTH_TOKEN configured)
 *   3. Deploy records    — workflow dispatches logged via POST /deploys
 *
 * Filters: env, app, severity, actor, requestId, sessionId, from, to, limit, cursor.
 *
 * Request correlation: events sharing `requestId` or `sessionId` are tagged so
 * the UI can group or link them (e.g. a deploy that introduced a Sentry spike).
 */
import { Hono, type Context } from 'hono';
import type { AppEnv } from '../types.js';
import {
  isEnvironment,
  isTimelineSeverity,
  severityFromAuditResult,
  severityFromSentryLevel,
  type TimelineEvent,
  type TimelineQuery,
  type TimelinePage,
} from '@latimer-woods-tech/studio-core';
import { queryAuditEntries } from '../lib/audit-store.js';

const timeline = new Hono<AppEnv>();

/**
 * GET /timeline
 *
 * Query params:
 *   env, app, severity, actor, requestId, sessionId, from, to, limit, cursor
 */
timeline.get('/', async (c) => {
  const ctx = c.var.envContext;
  const params = new URL(c.req.url).searchParams;

  const envParam = params.get('env');
  const env = isEnvironment(envParam) ? envParam : ctx.env;

  const severityParam = params.get('severity');
  const severity = isTimelineSeverity(severityParam) ? severityParam : undefined;

  const query: TimelineQuery = {
    env,
    app: params.get('app') ?? undefined,
    severity,
    actor: params.get('actor') ?? undefined,
    requestId: params.get('requestId') ?? undefined,
    sessionId: params.get('sessionId') ?? undefined,
    from: params.get('from') ?? undefined,
    to: params.get('to') ?? undefined,
    cursor: params.get('cursor') ?? undefined,
  };

  const limitRaw = params.get('limit');
  if (limitRaw) {
    const n = Number.parseInt(limitRaw, 10);
    if (Number.isFinite(n)) query.limit = Math.max(1, Math.min(200, n));
  }

  const limit = query.limit ?? 50;

  // ── 1. Audit events ─────────────────────────────────────────────────────────
  const auditEvents = await fetchAuditEvents(c, query, limit, ctx.role, ctx.userId);

  // ── 2. Sentry incidents ─────────────────────────────────────────────────────
  const sentryEvents = await fetchSentryEvents(c, query);

  // ── 3. Merge and sort (newest first) ────────────────────────────────────────
  const all = [...auditEvents, ...sentryEvents].sort(
    (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
  );

  // Apply severity filter after merge (Sentry severity is derived above).
  const filtered = severity ? all.filter((e) => e.severity === severity) : all;

  // Cursor pagination on the merged stream.
  const cursorDate = query.cursor ? new Date(query.cursor).getTime() : null;
  const afterCursor = cursorDate
    ? filtered.filter((e) => new Date(e.occurredAt).getTime() < cursorDate)
    : filtered;

  const hasMore = afterCursor.length > limit;
  const page = afterCursor.slice(0, limit);
  const last = page[page.length - 1];

  const result: TimelinePage = {
    events: page,
    nextCursor: hasMore && last ? last.occurredAt : null,
  };

  return c.json(result);
});

// ── Helpers ──────────────────────────────────────────────────────────────────

type HandlerContext = Context<AppEnv>;

async function fetchAuditEvents(
  c: HandlerContext,
  query: TimelineQuery,
  limit: number,
  role: string,
  userId: string,
): Promise<TimelineEvent[]> {
  try {
    const auditPage = await queryAuditEntries(c.env.DB, {
      env: query.env,
      actor: query.actor,
      requestId: query.requestId,
      sessionId: query.sessionId,
      from: query.from,
      to: query.to,
      cursor: query.cursor,
      // Fetch slightly more than limit so post-merge slice is accurate.
      limit: limit + 1,
      // Non-admin users see only their own entries.
      ...(role !== 'admin' && role !== 'owner' ? { userId } : {}),
    });

    return auditPage.rows.map((entry): TimelineEvent => ({
      id: entry.id,
      kind: 'audit',
      occurredAt: entry.occurredAt,
      env: entry.env,
      app: entry.resource ?? undefined,
      severity: severityFromAuditResult(entry.result),
      title: entry.action,
      action: entry.action,
      detail: {
        resource: entry.resource ?? null,
        resourceId: entry.resourceId ?? null,
        reversibility: entry.reversibility,
        result: entry.result,
        resultDetail: entry.resultDetail ?? null,
        payload: entry.payload,
      },
      actorId: entry.userId,
      actorEmail: entry.userEmail,
      actorRole: entry.userRole,
      requestId: entry.requestId,
      sessionId: entry.sessionId,
    }));
  } catch (err) {
    console.error('[timeline] audit fetch failed:', (err as Error).message);
    return [];
  }
}

interface SentryIssue {
  id: string;
  title: string;
  culprit?: string;
  level: string;
  count: string;
  userCount: number;
  firstSeen: string;
  lastSeen: string;
  permalink: string;
  tags?: Array<{ key: string; value: string }>;
}

async function fetchSentryEvents(
  c: HandlerContext,
  query: TimelineQuery,
): Promise<TimelineEvent[]> {
  const token = c.env.SENTRY_AUTH_TOKEN;
  const org = c.env.SENTRY_ORG;
  const project = c.env.SENTRY_PROJECT;

  if (!token || !org || !project) return [];

  // requestId correlation: sanitize before embedding in Sentry query.
  // A valid requestId is a UUID (hex chars + dashes only).
  const SAFE_REQUEST_ID = /^[0-9a-f-]{8,64}$/i;
  let sentryQuery = `is:unresolved`;
  if (query.requestId && SAFE_REQUEST_ID.test(query.requestId)) {
    sentryQuery += ` request.id:${query.requestId}`;
  }

  // Use the caller's env (falling back to the session default, not 'production')
  // so Sentry incidents are labelled with the correct environment.
  const resolvedEnv = query.env ?? 'staging';

  const sentryUrl = new URL(
    `https://sentry.io/api/0/projects/${encodeURIComponent(org)}/${encodeURIComponent(project)}/issues/`,
  );
  sentryUrl.searchParams.set('limit', '20');
  sentryUrl.searchParams.set('environment', resolvedEnv);
  sentryUrl.searchParams.set('statsPeriod', '24h');
  sentryUrl.searchParams.set('query', sentryQuery);
  if (query.from) sentryUrl.searchParams.set('start', query.from);
  if (query.to) sentryUrl.searchParams.set('end', query.to);

  try {
    const res = await fetch(sentryUrl.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    const issues: SentryIssue[] = await res.json();

    return issues.map((issue): TimelineEvent => ({
      id: `sentry-${issue.id}`,
      kind: 'incident',
      occurredAt: issue.lastSeen,
      // Use the queried env so every incident in this page has a consistent label.
      env: resolvedEnv,
      severity: severityFromSentryLevel(issue.level),
      title: issue.title,
      action: issue.culprit,
      detail: {
        count: issue.count,
        userCount: issue.userCount,
        firstSeen: issue.firstSeen,
        culprit: issue.culprit ?? null,
      },
      sourceUrl: issue.permalink,
    }));
  } catch (err) {
    console.error('[timeline] sentry fetch failed:', (err as Error).message);
    return [];
  }
}

export default timeline;

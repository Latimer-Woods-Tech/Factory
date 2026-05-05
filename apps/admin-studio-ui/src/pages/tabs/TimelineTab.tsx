/**
 * TimelineTab — unified incident and audit timeline with request correlation.
 *
 * Fetches from GET /timeline which merges:
 *   - Audit entries (operator actions)
 *   - Sentry incidents (application errors)
 *   - Deploy events (workflow dispatches)
 *
 * Filter parameters are URL-driven so operators can deep-link specific
 * investigations (e.g. by requestId to trace an error through its deploy).
 */
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiFetch } from '../../lib/api.js';
import type {
  TimelineEvent,
  TimelinePage,
  TimelineEventKind,
  TimelineSeverity,
  Environment,
} from '@latimer-woods-tech/studio-core';

interface Filters {
  env: Environment | '';
  app: string;
  severity: TimelineSeverity | '';
  actor: string;
  requestId: string;
  sessionId: string;
  from: string;
  to: string;
}

const EMPTY_FILTERS: Filters = {
  env: '',
  app: '',
  severity: '',
  actor: '',
  requestId: '',
  sessionId: '',
  from: '',
  to: '',
};

function buildQuery(f: Filters, cursor: string | null): string {
  const p = new URLSearchParams();
  if (f.env) p.set('env', f.env);
  if (f.app.trim()) p.set('app', f.app.trim());
  if (f.severity) p.set('severity', f.severity);
  if (f.actor.trim()) p.set('actor', f.actor.trim());
  if (f.requestId.trim()) p.set('requestId', f.requestId.trim());
  if (f.sessionId.trim()) p.set('sessionId', f.sessionId.trim());
  if (f.from) p.set('from', f.from);
  if (f.to) p.set('to', f.to);
  if (cursor) p.set('cursor', cursor);
  const s = p.toString();
  return s ? `?${s}` : '';
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const KIND_ICON: Record<TimelineEventKind, string> = {
  audit: '📋',
  incident: '🔥',
  deploy: '🚀',
};

const KIND_LABEL: Record<TimelineEventKind, string> = {
  audit: 'Audit',
  incident: 'Incident',
  deploy: 'Deploy',
};

const SEVERITY_COLOR: Record<TimelineSeverity, string> = {
  info: 'text-slate-400',
  warning: 'text-amber-400',
  error: 'text-red-400',
  critical: 'text-red-300 font-bold',
};

const SEVERITY_DOT: Record<TimelineSeverity, string> = {
  info: 'bg-slate-500',
  warning: 'bg-amber-500',
  error: 'bg-red-500',
  critical: 'bg-red-400',
};

// ── Component ─────────────────────────────────────────────────────────────────

export function TimelineTab() {
  const [searchParams] = useSearchParams();

  // Pre-populate requestId from URL if navigated from AuditTab.
  const [filters, setFilters] = useState<Filters>(() => ({
    ...EMPTY_FILTERS,
    requestId: searchParams.get('requestId') ?? '',
  }));

  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function load(reset: boolean) {
    setLoading(true);
    setErr(null);
    try {
      const page = await apiFetch<TimelinePage>(
        `/timeline/${buildQuery(filters, reset ? null : cursor)}`,
      );
      setEvents((prev) => (reset ? page.events : [...prev, ...page.events]));
      setNextCursor(page.nextCursor);
      if (reset) setCursor(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyFilters(e: React.FormEvent) {
    e.preventDefault();
    setEvents([]);
    setCursor(null);
    setExpanded(null);
    load(true);
  }

  function loadMore() {
    if (!nextCursor) return;
    setCursor(nextCursor);
    setTimeout(() => load(false), 0);
  }

  function toggleExpanded(id: string) {
    setExpanded((prev) => (prev === id ? null : id));
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold text-white">Timeline</h1>
        <p className="text-sm text-slate-400">
          Unified view of operator actions, application incidents, and deploys.
          Use <strong className="text-slate-300">Request&nbsp;ID</strong> or{' '}
          <strong className="text-slate-300">Session&nbsp;ID</strong> to correlate events
          across sources.
        </p>
      </header>

      {/* ── Filters ── */}
      <form
        onSubmit={applyFilters}
        className="grid grid-cols-1 gap-3 rounded border border-slate-800 bg-slate-900 p-4 md:grid-cols-4"
      >
        {/* Row 1 */}
        <label className="text-xs text-slate-400">
          env
          <select
            value={filters.env}
            onChange={(e) => setFilters({ ...filters, env: e.target.value as Filters['env'] })}
            className="mt-1 w-full rounded bg-slate-950 border border-slate-700 px-2 py-1 text-sm text-white"
          >
            <option value="">(session)</option>
            <option value="local">local</option>
            <option value="staging">staging</option>
            <option value="production">production</option>
          </select>
        </label>
        <label className="text-xs text-slate-400">
          app
          <input
            value={filters.app}
            onChange={(e) => setFilters({ ...filters, app: e.target.value })}
            placeholder="e.g. admin-studio"
            className="mt-1 w-full rounded bg-slate-950 border border-slate-700 px-2 py-1 text-sm text-white"
          />
        </label>
        <label className="text-xs text-slate-400">
          severity
          <select
            value={filters.severity}
            onChange={(e) =>
              setFilters({ ...filters, severity: e.target.value as Filters['severity'] })
            }
            className="mt-1 w-full rounded bg-slate-950 border border-slate-700 px-2 py-1 text-sm text-white"
          >
            <option value="">(all)</option>
            <option value="info">info</option>
            <option value="warning">warning</option>
            <option value="error">error</option>
            <option value="critical">critical</option>
          </select>
        </label>
        <label className="text-xs text-slate-400">
          actor (email or userId)
          <input
            value={filters.actor}
            onChange={(e) => setFilters({ ...filters, actor: e.target.value })}
            placeholder="e.g. alice@example.com"
            className="mt-1 w-full rounded bg-slate-950 border border-slate-700 px-2 py-1 text-sm text-white"
          />
        </label>

        {/* Row 2 */}
        <label className="text-xs text-slate-400">
          request ID
          <input
            value={filters.requestId}
            onChange={(e) => setFilters({ ...filters, requestId: e.target.value })}
            placeholder="exact X-Request-Id"
            className="mt-1 w-full rounded bg-slate-950 border border-slate-700 px-2 py-1 text-sm text-white font-mono"
          />
        </label>
        <label className="text-xs text-slate-400">
          session ID
          <input
            value={filters.sessionId}
            onChange={(e) => setFilters({ ...filters, sessionId: e.target.value })}
            placeholder="exact session ID"
            className="mt-1 w-full rounded bg-slate-950 border border-slate-700 px-2 py-1 text-sm text-white font-mono"
          />
        </label>
        <label className="text-xs text-slate-400">
          from
          <input
            type="datetime-local"
            value={filters.from}
            onChange={(e) => setFilters({ ...filters, from: e.target.value })}
            className="mt-1 w-full rounded bg-slate-950 border border-slate-700 px-2 py-1 text-sm text-white"
          />
        </label>
        <label className="text-xs text-slate-400">
          to
          <input
            type="datetime-local"
            value={filters.to}
            onChange={(e) => setFilters({ ...filters, to: e.target.value })}
            className="mt-1 w-full rounded bg-slate-950 border border-slate-700 px-2 py-1 text-sm text-white"
          />
        </label>

        <div className="md:col-span-4 flex gap-2">
          <button
            type="submit"
            className="rounded bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 text-sm font-medium text-white"
          >
            Apply
          </button>
          <button
            type="button"
            onClick={() => {
              setFilters(EMPTY_FILTERS);
              setEvents([]);
              setCursor(null);
              setExpanded(null);
              setTimeout(() => load(true), 0);
            }}
            className="rounded bg-slate-700 hover:bg-slate-600 px-3 py-1.5 text-sm text-white"
          >
            Reset
          </button>
        </div>
      </form>

      {err && (
        <div className="rounded border border-red-700 bg-red-900/30 p-3 text-sm text-red-300">
          {err}
        </div>
      )}

      {/* ── Timeline feed ── */}
      <div className="space-y-2">
        {events.length === 0 && !loading && (
          <p className="text-center text-slate-500 py-12">No events match these filters.</p>
        )}

        {events.map((ev) => (
          <div
            key={ev.id}
            className="rounded border border-slate-800 bg-slate-900 overflow-hidden"
          >
            {/* ── Event row ── */}
            <button
              type="button"
              onClick={() => toggleExpanded(ev.id)}
              className="w-full text-left px-4 py-3 hover:bg-slate-800/60 transition-colors"
              aria-expanded={expanded === ev.id}
            >
              <div className="flex items-start gap-3">
                {/* Severity dot */}
                <span
                  className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${SEVERITY_DOT[ev.severity]}`}
                  aria-label={ev.severity}
                />

                {/* Icon + kind badge */}
                <span className="text-base leading-none" aria-hidden>
                  {KIND_ICON[ev.kind]}
                </span>

                {/* Main content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`text-xs font-medium uppercase tracking-wide ${SEVERITY_COLOR[ev.severity]}`}
                    >
                      {ev.severity}
                    </span>
                    <span className="text-xs text-slate-600">
                      {KIND_LABEL[ev.kind]}
                    </span>
                    {ev.env && (
                      <span className="text-xs rounded bg-slate-800 px-1.5 py-0.5 text-slate-400">
                        {ev.env}
                      </span>
                    )}
                    {ev.app && (
                      <span className="text-xs rounded bg-slate-800 px-1.5 py-0.5 text-slate-400">
                        {ev.app}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-white font-mono truncate">{ev.title}</p>
                  <div className="mt-1 flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                    <span>{new Date(ev.occurredAt).toLocaleString()}</span>
                    {ev.actorEmail && <span>by {ev.actorEmail}</span>}
                    {ev.requestId && (
                      <span
                        title="Request ID"
                        className="font-mono text-sky-500"
                      >
                        req:{ev.requestId.slice(0, 8)}
                      </span>
                    )}
                    {ev.sessionId && (
                      <span title="Session ID" className="font-mono text-violet-400">
                        sess:{ev.sessionId.slice(0, 8)}
                      </span>
                    )}
                    {ev.sourceUrl && (
                      <a
                        href={ev.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-sky-400 hover:text-sky-300 hover:underline"
                      >
                        {ev.kind === 'incident' ? 'Sentry ↗' : ev.kind === 'deploy' ? 'GitHub ↗' : 'View ↗'}
                      </a>
                    )}
                    {ev.deployRef && (
                      <span className="font-mono text-slate-400">
                        @{ev.deployRef.slice(0, 7)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Expand chevron */}
                <span className="text-slate-600 text-xs">
                  {expanded === ev.id ? '▲' : '▼'}
                </span>
              </div>
            </button>

            {/* ── Expanded detail ── */}
            {expanded === ev.id && (
              <div className="border-t border-slate-800 px-4 py-3 bg-slate-950">
                <dl className="grid grid-cols-1 gap-y-2 text-xs md:grid-cols-2 md:gap-x-6">
                  <FieldRow label="ID" value={ev.id} mono />
                  <FieldRow label="Kind" value={ev.kind} />
                  <FieldRow label="Occurred at" value={ev.occurredAt} />
                  <FieldRow label="Severity" value={ev.severity} />
                  {ev.actorId && <FieldRow label="Actor ID" value={ev.actorId} mono />}
                  {ev.actorEmail && <FieldRow label="Actor email" value={ev.actorEmail} />}
                  {ev.actorRole && <FieldRow label="Actor role" value={ev.actorRole} />}
                  {ev.requestId && <FieldRow label="Request ID" value={ev.requestId} mono />}
                  {ev.sessionId && <FieldRow label="Session ID" value={ev.sessionId} mono />}
                  {ev.action && <FieldRow label="Action" value={ev.action} mono />}
                  {ev.deployRef && <FieldRow label="Deploy ref" value={ev.deployRef} mono />}
                  {ev.sourceUrl && (
                    <div className="md:col-span-2">
                      <dt className="text-slate-500">Source</dt>
                      <dd>
                        <a
                          href={ev.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sky-400 hover:text-sky-300 hover:underline font-mono break-all"
                        >
                          {ev.sourceUrl}
                        </a>
                      </dd>
                    </div>
                  )}
                  {ev.detail && Object.keys(ev.detail).length > 0 && (
                    <div className="md:col-span-2">
                      <dt className="text-slate-500 mb-1">Detail</dt>
                      <dd>
                        <pre className="overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-300 max-h-48">
                          {JSON.stringify(ev.detail, null, 2)}
                        </pre>
                      </dd>
                    </div>
                  )}
                </dl>

                {/* Correlation search buttons */}
                <div className="mt-3 flex gap-2 flex-wrap">
                  {ev.requestId && (
                    <button
                      type="button"
                      onClick={() => {
                        const rid = ev.requestId ?? '';
                        setFilters({ ...EMPTY_FILTERS, requestId: rid });
                        setEvents([]);
                        setCursor(null);
                        setExpanded(null);
                        setTimeout(() => load(true), 0);
                      }}
                      className="rounded bg-sky-800 hover:bg-sky-700 px-2 py-1 text-xs text-white"
                    >
                      All events with this request ID
                    </button>
                  )}
                  {ev.sessionId && (
                    <button
                      type="button"
                      onClick={() => {
                        const sid = ev.sessionId ?? '';
                        setFilters({ ...EMPTY_FILTERS, sessionId: sid });
                        setEvents([]);
                        setCursor(null);
                        setExpanded(null);
                        setTimeout(() => load(true), 0);
                      }}
                      className="rounded bg-violet-800 hover:bg-violet-700 px-2 py-1 text-xs text-white"
                    >
                      All events in this session
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}

        {loading && (
          <p className="text-center text-slate-500 py-6">Loading…</p>
        )}
      </div>

      {nextCursor && (
        <button
          onClick={loadMore}
          disabled={loading}
          className="rounded bg-slate-700 hover:bg-slate-600 px-3 py-1.5 text-sm text-white disabled:opacity-40"
        >
          Load more
        </button>
      )}
    </div>
  );
}

// ── Sub-component ─────────────────────────────────────────────────────────────

function FieldRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className={`text-slate-200 break-all ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  );
}

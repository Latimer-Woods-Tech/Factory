import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api.js';
import { AppHealthGrid } from '../../components/AppHealthGrid.js';
import { DeployVersionsTable } from '../../components/DeployVersionsTable.js';
import { SyntheticJourneyPanel } from '../../components/SyntheticJourneyPanel.js';

interface Me {
  env: string;
  user: { id: string; email: string; role: string };
  sessionId: string;
  envLockedAt: number;
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
}

interface SentryResp {
  configured: boolean;
  note?: string;
  env?: string;
  error?: string;
  issues: SentryIssue[];
}

interface PostHogResp {
  configured: boolean;
  note?: string;
  tiles: Array<{ id: string; label: string; value: number; unit?: string }>;
}

interface TelemetryEndpointResult {
  path: string;
  status: 'ok' | 'missing' | 'error' | 'skipped';
  httpStatus?: number;
  latencyMs?: number;
}

interface TelemetryCoverageResp {
  env: string;
  note?: string;
  apps: Array<{
    id: string;
    label: string;
    endpoints: TelemetryEndpointResult[];
  }>;
}

export function OverviewTab() {
  const [me, setMe] = useState<Me | null>(null);
  const [sentry, setSentry] = useState<SentryResp | null>(null);
  const [posthog, setPostHog] = useState<PostHogResp | null>(null);
  const [coverage, setCoverage] = useState<TelemetryCoverageResp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sentryErr, setSentryErr] = useState<string | null>(null);
  const [posthogErr, setPosthogErr] = useState<string | null>(null);
  const [coverageErr, setCoverageErr] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Me>('/me').then(setMe).catch((e) => setErr((e as Error).message));
  }, []);

  useEffect(() => {
    if (!me) return;
    apiFetch<SentryResp>(`/observability/sentry/issues?limit=10&env=${encodeURIComponent(me.env)}`)
      .then(setSentry)
      .catch((e) => setSentryErr((e as Error).message));
    apiFetch<PostHogResp>('/observability/posthog/tiles')
      .then(setPostHog)
      .catch((e) => setPosthogErr((e as Error).message));
    apiFetch<TelemetryCoverageResp>(`/observability/telemetry-coverage?env=${encodeURIComponent(me.env)}`)
      .then(setCoverage)
      .catch((e) => setCoverageErr((e as Error).message));
  }, [me]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-white">Overview</h1>
      <p className="text-sm text-slate-400">
        Live cross-app health, deploys, errors, and engagement for the active environment.
      </p>

      <div className="rounded border border-slate-800 bg-slate-900 p-4">
        <h2 className="text-sm font-semibold text-slate-200">Session</h2>
        {err && <p className="text-red-400 text-sm">{err}</p>}
        {me ? (
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <dt className="text-slate-400">Environment</dt>
            <dd className="text-white">{me.env}</dd>
            <dt className="text-slate-400">User</dt>
            <dd className="text-white">{me.user.email}</dd>
            <dt className="text-slate-400">Role</dt>
            <dd className="text-white">{me.user.role}</dd>
            <dt className="text-slate-400">Session ID</dt>
            <dd className="text-white font-mono text-xs">{me.sessionId}</dd>
            <dt className="text-slate-400">Locked at</dt>
            <dd className="text-white">
              {typeof me.envLockedAt === 'number' && me.envLockedAt > 0
                ? new Date(me.envLockedAt).toLocaleString()
                : '—'}
            </dd>
          </dl>
        ) : (
          <p className="text-sm text-slate-500">Loading…</p>
        )}
      </div>

      {me && (
        <>
          <AppHealthGrid env={me.env} />

          <SyntheticJourneyPanel />

          {/* PostHog */}
          <div className="rounded border border-slate-800 bg-slate-900 p-4">
            <h2 className="text-sm font-semibold text-slate-200">PostHog</h2>
            {posthogErr ? (
              <p className="mt-1 text-xs text-red-400">Error: {posthogErr}</p>
            ) : !posthog ? (
              <p className="mt-1 text-xs text-slate-500">Loading…</p>
            ) : !posthog.configured ? (
              <p className="mt-1 text-xs text-amber-300">{posthog.note}</p>
            ) : (
              <ul className="mt-2 grid grid-cols-3 gap-3">
                {posthog.tiles.map((t) => (
                  <li
                    key={t.id}
                    className="rounded border border-slate-800 bg-slate-950 p-3 text-center"
                  >
                    <div className="text-xs uppercase text-slate-500">{t.label}</div>
                    <div className="mt-1 text-2xl font-semibold text-white">
                      {t.value.toLocaleString()}
                      {t.unit ? <span className="text-sm text-slate-400 ml-1">{t.unit}</span> : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <DeployVersionsTable env={me.env} />

          {/* Sentry */}
          <div className="rounded border border-slate-800 bg-slate-900">
            <header className="flex items-center justify-between border-b border-slate-800 px-4 py-2">
              <h2 className="text-sm font-semibold text-slate-200">Sentry — recent issues</h2>
              {sentry?.env && (
                <span className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
                  env: {sentry.env}
                </span>
              )}
            </header>
            {sentryErr ? (
              <p className="px-4 py-3 text-xs text-red-400">Error: {sentryErr}</p>
            ) : !sentry ? (
              <p className="px-4 py-3 text-sm text-slate-500">Loading…</p>
            ) : !sentry.configured ? (
              <div className="px-4 py-3">
                <p className="text-xs text-amber-300">{sentry.note}</p>
                <p className="mt-1 text-xs text-slate-500">
                  Set <code className="font-mono">SENTRY_AUTH_TOKEN</code>,{' '}
                  <code className="font-mono">SENTRY_ORG</code>, and{' '}
                  <code className="font-mono">SENTRY_PROJECT</code> worker secrets.
                </p>
              </div>
            ) : sentry.error ? (
              <p className="px-4 py-3 text-xs text-amber-300">⚠ Sentry degraded: {sentry.error}</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-xs text-slate-500">
                    <th className="px-4 py-2 text-left font-normal">Level</th>
                    <th className="px-4 py-2 text-left font-normal">Issue</th>
                    <th className="px-4 py-2 text-right font-normal">Events</th>
                    <th className="px-4 py-2 text-right font-normal">Users</th>
                    <th className="px-4 py-2 text-right font-normal">Last seen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {sentry.issues.map((i) => (
                    <tr key={i.id} className="hover:bg-slate-800/40">
                      <td className="px-4 py-2">
                        <span
                          className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium uppercase ${
                            i.level === 'fatal' || i.level === 'error'
                              ? 'bg-red-900/60 text-red-300'
                              : i.level === 'warning'
                                ? 'bg-amber-900/60 text-amber-300'
                                : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {i.level}
                        </span>
                      </td>
                      <td className="max-w-xs px-4 py-2">
                        <a
                          href={i.permalink}
                          target="_blank"
                          rel="noreferrer"
                          className="block truncate text-white hover:underline"
                          title={i.title}
                        >
                          {i.title}
                        </a>
                        {i.culprit && (
                          <span className="block truncate text-xs text-slate-500" title={i.culprit}>
                            {i.culprit}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-xs text-slate-300">
                        {Number(i.count).toLocaleString()}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-xs text-slate-300">
                        {i.userCount.toLocaleString()}
                      </td>
                      <td className="px-4 py-2 text-right text-xs text-slate-500">
                        {new Date(i.lastSeen).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                  {sentry.issues.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-3 text-center text-sm text-slate-500">
                        ✓ No unresolved issues in the last 24h.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>

          {/* Telemetry Contract Coverage (ADM-7) */}
          <div className="rounded border border-slate-800 bg-slate-900">
            <header className="flex items-center justify-between border-b border-slate-800 px-4 py-2">
              <h2 className="text-sm font-semibold text-slate-200">Telemetry Contract Coverage</h2>
              {coverage?.env && (
                <span className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
                  env: {coverage.env}
                </span>
              )}
            </header>
            {coverageErr ? (
              <p className="px-4 py-3 text-xs text-red-400">Error: {coverageErr}</p>
            ) : !coverage ? (
              <p className="px-4 py-3 text-sm text-slate-500">Loading…</p>
            ) : coverage.note ? (
              <p className="px-4 py-3 text-xs text-amber-300">{coverage.note}</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-xs text-slate-500">
                    <th className="px-4 py-2 text-left font-normal">App</th>
                    <th className="px-4 py-2 text-center font-normal">/api/admin/health</th>
                    <th className="px-4 py-2 text-center font-normal">/api/admin/metrics</th>
                    <th className="px-4 py-2 text-center font-normal">/api/admin/events</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {coverage.apps.map((app) => (
                    <tr key={app.id} className="hover:bg-slate-800/40">
                      <td className="px-4 py-2 text-white">{app.label}</td>
                      {app.endpoints.map((ep) => (
                        <td key={ep.path} className="px-4 py-2 text-center">
                          {ep.status === 'ok' && (
                            <span className="text-green-400" title={`HTTP ${ep.httpStatus ?? '?'} — ${ep.latencyMs ?? '?'}ms`}>✓</span>
                          )}
                          {ep.status === 'missing' && (
                            <span className="text-red-400" title="404 — Not implemented">✗</span>
                          )}
                          {ep.status === 'error' && (
                            <span className="text-amber-400" title={`HTTP ${ep.httpStatus ?? 'timeout'}`}>⚠</span>
                          )}
                          {ep.status === 'skipped' && (
                            <span className="text-slate-600" title="No URL available">—</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}

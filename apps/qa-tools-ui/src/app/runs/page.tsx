/**
 * Runs list page + run detail (query-param routing).
 *
 * /runs              — shows the full filterable runs list
 * /runs?id=<uuid>    — shows the detail for a specific run
 *
 * Dynamic IDs are handled via a query param so the app works as a
 * Next.js static export on Cloudflare Pages (no server-side routing needed).
 *
 * See: docs/architecture/QA_TOOLS_ARCHITECTURE.md §5.2
 */

'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { RunTable } from '@/components/run-table';
import { ViolationList } from '@/components/violation-list';
import { StatusBadge } from '@/components/status-badge';
import {
  createGitHubIssue,
  getRunResults,
  getRunStatus,
  listRuns,
  rerunRun,
} from '@/lib/api';
import { isAuthenticated } from '@/lib/auth';
import type {
  AppId,
  Environment,
  RunDetail,
  RunFinding,
  RunStatus,
  RunSummary,
} from '@/lib/types';
import { APP_IDS, APP_LABELS } from '@/lib/types';

// ---------------------------------------------------------------------------
// Page entry — wraps in Suspense for useSearchParams
// ---------------------------------------------------------------------------

export default function RunsPage() {
  return (
    <Suspense>
      <RunsPageInner />
    </Suspense>
  );
}

function RunsPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const runId = params.get('id');

  useEffect(() => {
    if (!isAuthenticated()) router.replace('/login');
  }, [router]);

  if (runId) return <RunDetailView runId={runId} />;
  return <RunListView />;
}

// ---------------------------------------------------------------------------
// Run list
// ---------------------------------------------------------------------------

function RunListView() {
  const [runs, setRuns]     = useState<RunSummary[]>([]);
  const [total, setTotal]   = useState(0);
  const [loading, setLoad]  = useState(true);
  const [page, setPage]     = useState(0);
  const [filterApp, setApp] = useState<AppId | ''>('');
  const [filterEnv, setEnv] = useState<Environment | ''>('');
  const [filterSt, setSt]   = useState<RunStatus | ''>('');

  const LIMIT = 20;

  const load = useCallback(async () => {
    setLoad(true);
    try {
      const res = await listRuns({
        appId:       filterApp  || undefined,
        environment: filterEnv  || undefined,
        status:      filterSt   || undefined,
        limit:       LIMIT,
        offset:      page * LIMIT,
      });
      setRuns(res.runs);
      setTotal(res.total);
    } catch (err) {
      console.error('Run list load failed:', err);
    } finally {
      setLoad(false);
    }
  }, [filterApp, filterEnv, filterSt, page]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl text-gray-900">Runs</h1>
        <span className="text-sm text-gray-400">{String(total)} total</span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={filterApp}
          onChange={(e) => { setApp(e.target.value as AppId | ''); setPage(0); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          <option value="">All apps</option>
          {APP_IDS.map((id) => (
            <option key={id} value={id}>{APP_LABELS[id]}</option>
          ))}
        </select>

        <select
          value={filterEnv}
          onChange={(e) => { setEnv(e.target.value as Environment | ''); setPage(0); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          <option value="">All envs</option>
          <option value="production">Production</option>
          <option value="staging">Staging</option>
        </select>

        <select
          value={filterSt}
          onChange={(e) => { setSt(e.target.value as RunStatus | ''); setPage(0); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          <option value="">All statuses</option>
          {(['pending','running','passed','failed','error','flaky'] as RunStatus[]).map((s) => (
            <option key={s} value={s} className="capitalize">{s}</option>
          ))}
        </select>

        <button onClick={() => void load()} className="btn-secondary text-xs">
          Refresh
        </button>
      </div>

      <RunTable runs={runs} loading={loading} />

      {/* Pagination */}
      {total > LIMIT && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="btn-secondary text-xs"
          >
            ← Previous
          </button>
          <span>
            Page {String(page + 1)} of {String(Math.ceil(total / LIMIT))}
          </span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={(page + 1) * LIMIT >= total}
            className="btn-secondary text-xs"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Run detail
// ---------------------------------------------------------------------------

function RunDetailView({ runId }: { runId: string }) {
  const [detail, setDetail]         = useState<RunDetail | null>(null);
  const [findings, setFindings]     = useState<RunFinding[]>([]);
  const [activeTab, setTab]         = useState<'violations' | 'summary'>('summary');
  const [loading, setLoad]          = useState(true);
  const [issuing, setIssuing]       = useState(false);
  const [issueUrl, setIssueUrl]     = useState<string | null>(null);
  const [issueError, setIssueError] = useState<string | null>(null);
  const [rerunId, setRerunId]       = useState<string | null>(null);
  const [rerunErr, setRerunErr]     = useState<string | null>(null);

  const loadDetail = useCallback(async () => {
    setLoad(true);
    try {
      const [d, r] = await Promise.all([
        getRunStatus(runId),
        getRunResults(runId).catch(() => null),
      ]);
      setDetail(d);
      if (r) {
        const all = Object.values(r.results).flat();
        setFindings(all);
      }
    } catch (err) {
      console.error('Run detail load failed:', err);
    } finally {
      setLoad(false);
    }
  }, [runId]);

  useEffect(() => { void loadDetail(); }, [loadDetail]);

  // Auto-poll while run is in-flight
  useEffect(() => {
    if (!detail) return;
    if (detail.status === 'pending' || detail.status === 'running') {
      const t = setTimeout(() => { void loadDetail(); }, 4000);
      return () => clearTimeout(t);
    }
  }, [detail, loadDetail]);

  async function handleCreateIssue() {
    setIssuing(true);
    setIssueUrl(null);
    setIssueError(null);
    try {
      const res = await createGitHubIssue(runId);
      setIssueUrl(res.issueUrl);
    } catch (err) {
      setIssueError(err instanceof Error ? err.message : 'Failed to create issue');
    } finally {
      setIssuing(false);
    }
  }

  async function handleRerun() {
    try {
      const res = await rerunRun(runId);
      setRerunId(res.runId);
    } catch (err) {
      setRerunErr(err instanceof Error ? err.message : 'Rerun failed');
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-40 animate-pulse rounded bg-gray-200" />
        <div className="card h-32 animate-pulse bg-gray-100" />
      </div>
    );
  }

  if (!detail) {
    return <p className="text-sm text-gray-500">Run not found.</p>;
  }

  return (
    <div className="space-y-6">
      {/* Back link */}
      <a href="/runs" className="text-xs text-brand-600 hover:underline">
        ← Back to runs
      </a>

      {/* Header */}
      <div className="card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h1 className="text-xl text-gray-900">
                {APP_LABELS[detail.appId]} / {detail.environment}
              </h1>
              <StatusBadge status={detail.status} pulse />
            </div>
            <p className="text-xs text-gray-400 font-mono">{detail.runId}</p>
            <div className="flex flex-wrap gap-2 text-xs text-gray-500">
              <span>Profile: <strong>{detail.profile}</strong></span>
              <span>Type: <strong>{detail.testType}</strong></span>
              {detail.durationMs != null && (
                <span>Duration: <strong>{String(Math.round(detail.durationMs / 1000))}s</strong></span>
              )}
              {detail.attemptNumber > 1 && (
                <span>Attempt <strong>{String(detail.attemptNumber)}</strong> of {String(detail.maxAttempts)}</span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            {detail.status === 'failed' && !detail.githubIssueUrl && (
              <button
                onClick={() => void handleCreateIssue()}
                disabled={issuing}
                className="btn-secondary text-xs"
              >
                {issuing ? '⏳' : '🐛'} Create GitHub Issue
              </button>
            )}
            {detail.githubIssueUrl && (
              <a
                href={detail.githubIssueUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary text-xs"
              >
                🔗 View Issue
              </a>
            )}
            <button
              onClick={() => void handleRerun()}
              className="btn-secondary text-xs"
            >
              🔄 Rerun
            </button>
          </div>
        </div>

        {/* Error message */}
        {detail.errorMessage && (
          <div className="mt-3 rounded bg-orange-50 border border-orange-200 px-3 py-2 text-xs text-orange-800">
            {detail.errorMessage}
          </div>
        )}

        {/* Action feedback */}
        {issueUrl && (
          <div className="mt-3 rounded bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-700">
            Issue created:{' '}
            <a href={issueUrl} target="_blank" rel="noopener noreferrer" className="underline">
              {issueUrl}
            </a>
          </div>
        )}
        {issueError && (
          <p className="mt-2 text-xs text-red-600">{issueError}</p>
        )}
        {rerunId && (
          <div className="mt-3 rounded bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-700">
            New run started:{' '}
            <a href={`/runs?id=${rerunId}`} className="underline">
              {rerunId.slice(0, 8)}…
            </a>
          </div>
        )}
        {rerunErr && (
          <p className="mt-2 text-xs text-red-600">{rerunErr}</p>
        )}
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Violations" value={String(detail.violationsCount)} highlight={detail.violationsCount > 0 ? 'red' : 'green'} />
        <StatCard label="Passes" value={String(detail.passesCount)} highlight="green" />
        <StatCard label="Findings" value={String(findings.length)} />
        <StatCard
          label="Open"
          value={String(findings.filter((f) => f.status === 'open').length)}
          highlight={findings.some((f) => f.status === 'open') ? 'red' : 'green'}
        />
      </div>

      {/* Tabs */}
      <div>
        <div className="flex gap-1 border-b border-gray-200 mb-4">
          {(['summary', 'violations'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setTab(tab)}
              className={[
                'px-4 py-2 text-sm font-medium capitalize border-b-2 -mb-px transition-colors',
                activeTab === tab
                  ? 'border-brand-600 text-brand-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700',
              ].join(' ')}
            >
              {tab}
              {tab === 'violations' && findings.length > 0 && (
                <span className="ml-1.5 badge bg-red-100 text-red-700 text-xs">
                  {String(findings.filter((f) => f.status === 'open').length)}
                </span>
              )}
            </button>
          ))}
        </div>

        {activeTab === 'summary' && (
          <div className="card text-sm text-gray-600 space-y-2">
            <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-xs">
              <div><span className="text-gray-400">Run ID:</span> <span className="font-mono">{detail.runId}</span></div>
              <div><span className="text-gray-400">Status:</span> {detail.status}</div>
              <div><span className="text-gray-400">App:</span> {APP_LABELS[detail.appId]}</div>
              <div><span className="text-gray-400">Env:</span> {detail.environment}</div>
              <div><span className="text-gray-400">Profile:</span> {detail.profile}</div>
              <div><span className="text-gray-400">Test type:</span> {detail.testType}</div>
              {detail.completedAt && (
                <div><span className="text-gray-400">Completed:</span> {new Date(detail.completedAt).toLocaleString()}</div>
              )}
              {detail.durationMs != null && (
                <div><span className="text-gray-400">Duration:</span> {String(Math.round(detail.durationMs / 1000))}s</div>
              )}
              {detail.tags.length > 0 && (
                <div className="col-span-2">
                  <span className="text-gray-400">Tags:</span>{' '}
                  {detail.tags.map((t) => (
                    <span key={t} className="badge bg-gray-100 text-gray-600 mr-1">{t}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'violations' && (
          <ViolationList
            findings={findings}
            runId={runId}
            onUpdate={() => void loadDetail()}
          />
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: 'red' | 'green' }) {
  const valueClass =
    highlight === 'red' && value !== '0'
      ? 'text-red-600'
      : highlight === 'green'
      ? 'text-green-600'
      : 'text-gray-900';

  return (
    <div className="card text-center py-4">
      <p className={`text-2xl font-semibold ${valueClass}`}>{value}</p>
      <p className="text-xs text-gray-400 mt-0.5">{label}</p>
    </div>
  );
}

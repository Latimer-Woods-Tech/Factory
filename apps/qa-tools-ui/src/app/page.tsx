/**
 * Dashboard — the landing page for QA Tools.
 *
 * Shows:
 *  1. Health grid: 4 apps × staging + production (color-coded by status)
 *  2. Recent runs: last 10 runs across all apps
 *  3. Quick-start: one-click fast audit buttons per app
 *
 * All data is fetched client-side via the API client.
 * Unauthenticated users are redirected to /login.
 *
 * See: docs/architecture/QA_TOOLS_ARCHITECTURE.md §5.2 Dashboard
 */

'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { HealthGrid } from '@/components/health-grid';
import { RunTable } from '@/components/run-table';
import { createRun, getAllAppsHealth, listRuns } from '@/lib/api';
import { isAuthenticated } from '@/lib/auth';
import type { AppHealth, AppId, CreateRunResponse, RunSummary } from '@/lib/types';

const QUICK_START_APPS: { appId: AppId; label: string; env: 'production' | 'staging' }[] = [
  { appId: 'capricast',       label: 'Capricast prod',        env: 'production' },
  { appId: 'selfprime',       label: 'Selfprime prod',        env: 'production' },
  { appId: 'cipherofhealing', label: 'Cipher of Healing prod', env: 'production' },
  { appId: 'xicocity',        label: 'Xico City prod',         env: 'production' },
];

export default function DashboardPage() {
  const router = useRouter();

  const [health, setHealth]         = useState<AppHealth[]>([]);
  const [healthLoading, setHL]      = useState(true);
  const [runs, setRuns]             = useState<RunSummary[]>([]);
  const [runsLoading, setRL]        = useState(true);
  const [launchingApp, setLaunching] = useState<AppId | null>(null);
  const [launchResult, setResult]   = useState<CreateRunResponse | null>(null);
  const [launchError, setLError]    = useState<string | null>(null);

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated()) router.replace('/login');
  }, [router]);

  const reload = useCallback(async () => {
    setHL(true);
    setRL(true);
    try {
      const [h, r] = await Promise.all([
        getAllAppsHealth(),
        listRuns({ limit: 10 }),
      ]);
      setHealth(h);
      setRuns(r.runs);
    } catch (err) {
      console.error('Dashboard load failed:', err);
    } finally {
      setHL(false);
      setRL(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated()) void reload();
  }, [reload]);

  async function handleQuickStart(appId: AppId, env: 'production' | 'staging') {
    setLaunching(appId);
    setResult(null);
    setLError(null);
    try {
      const res = await createRun({
        appId,
        environment: env,
        testType: 'a11y',
        profile: 'fast',
        testConfig: { thresholds: { violationsMax: 0 } },
      });
      setResult(res);
      // Refresh runs table after a short delay
      setTimeout(() => { void reload(); }, 1500);
    } catch (err) {
      setLError(err instanceof Error ? err.message : 'Launch failed');
    } finally {
      setLaunching(null);
    }
  }

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">
          App health across all environments. Click any cell to drill in.
        </p>
      </div>

      {/* Health grid */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            App Health
          </h2>
          <button
            onClick={() => void reload()}
            className="text-xs text-brand-600 hover:underline"
          >
            Refresh
          </button>
        </div>
        <HealthGrid healthData={health} loading={healthLoading} />
      </section>

      {/* Quick-start */}
      <section>
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
          Quick Audit (fast profile)
        </h2>
        <div className="flex flex-wrap gap-2">
          {QUICK_START_APPS.map(({ appId, label, env }) => (
            <button
              key={appId}
              onClick={() => void handleQuickStart(appId, env)}
              disabled={launchingApp === appId}
              className="btn-secondary text-xs"
            >
              {launchingApp === appId ? '⏳' : '▶'} {label}
            </button>
          ))}
        </div>
        {launchResult && (
          <div className="mt-3 rounded-lg bg-green-50 border border-green-200 px-4 py-2 text-sm">
            <span className="text-green-700">
              ✅ Run <strong>{launchResult.runId.slice(0, 8)}…</strong> started.{' '}
            </span>
            <a
              href={`/runs?id=${launchResult.runId}`}
              className="text-brand-600 underline text-xs"
            >
              View →
            </a>
          </div>
        )}
        {launchError && (
          <p className="mt-2 text-xs text-red-600">{launchError}</p>
        )}
      </section>

      {/* Recent runs */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            Recent Runs
          </h2>
          <a href="/runs" className="text-xs text-brand-600 hover:underline">
            View all →
          </a>
        </div>
        <RunTable runs={runs} loading={runsLoading} emptyMessage="No runs yet. Launch a quick audit above." />
      </section>
    </div>
  );
}

/**
 * Per-app view.
 *
 * /apps?appId=<appId>&environment=<env>
 *
 * Shows the health summary for one app/environment combination plus the
 * run history for that combination.
 *
 * See: docs/architecture/QA_TOOLS_ARCHITECTURE.md §5.2 App Detail
 */

'use client';

import { useCallback, useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { RunTable } from '@/components/run-table';
import { getAppHealth, listRuns } from '@/lib/api';
import { isAuthenticated } from '@/lib/auth';
import type { AppHealth, AppId, Environment, RunSummary } from '@/lib/types';
import { APP_IDS, APP_LABELS, HEALTH_COLORS } from '@/lib/types';

export default function AppDetailPage() {
  return (
    <Suspense>
      <AppDetailInner />
    </Suspense>
  );
}

function AppDetailInner() {
  const router = useRouter();
  const params = useSearchParams();

  const appId      = (params.get('appId') ?? 'capricast') as AppId;
  const envParam   = params.get('environment');
  const environment: Environment = envParam === 'staging' ? 'staging' : 'production';

  const [health, setHealth]   = useState<AppHealth | null>(null);
  const [runs, setRuns]       = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated()) router.replace('/login');
  }, [router]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [h, r] = await Promise.all([
        getAppHealth(appId, environment),
        listRuns({ appId, environment, limit: 25 }),
      ]);
      setHealth(h);
      setRuns(r.runs);
    } catch (err) {
      console.error('App detail load failed:', err);
    } finally {
      setLoading(false);
    }
  }, [appId, environment]);

  useEffect(() => { if (isAuthenticated()) void load(); }, [load]);

  const healthColor = health ? HEALTH_COLORS[health.statusLabel] : HEALTH_COLORS.unknown;

  return (
    <div className="space-y-6">
      {/* Back */}
      <Link href="/" className="text-xs text-brand-600 hover:underline">← Dashboard</Link>

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl text-gray-900">{APP_LABELS[appId] ?? appId}</h1>
          <p className="text-sm text-gray-500 capitalize">{environment}</p>
        </div>
        {/* Environment toggle */}
        <div className="flex gap-1">
          {(['production', 'staging'] as const).map((env) => (
            <a
              key={env}
              href={`/apps?appId=${appId}&environment=${env}`}
              className={[
                'rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors',
                env === environment
                  ? 'bg-brand-600 text-white'
                  : 'bg-white text-gray-600 ring-1 ring-gray-300 hover:bg-gray-50',
              ].join(' ')}
            >
              {env}
            </a>
          ))}
        </div>
      </div>

      {/* App selector */}
      <div className="flex flex-wrap gap-2">
        {APP_IDS.map((id) => (
          <a
            key={id}
            href={`/apps?appId=${id}&environment=${environment}`}
            className={[
              'rounded-full px-3 py-1 text-xs font-medium transition-colors',
              id === appId
                ? 'bg-brand-100 text-brand-700'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
            ].join(' ')}
          >
            {APP_LABELS[id]}
          </a>
        ))}
      </div>

      {/* Health summary */}
      {loading ? (
        <div className={`card border animate-pulse h-24 ${healthColor}`} />
      ) : health ? (
        <div className={`card border ${healthColor}`}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-lg font-semibold capitalize">{health.statusLabel}</p>
              {health.lastRunAt && (
                <p className="text-xs text-gray-500 mt-0.5">
                  Last run: {new Date(health.lastRunAt).toLocaleString()}
                  {health.lastRunStatus && ` — ${health.lastRunStatus}`}
                </p>
              )}
            </div>
            {health.openViolationsCount > 0 && (
              <div className="text-right">
                <p className="text-2xl font-semibold text-red-600">
                  {String(health.openViolationsCount)}
                </p>
                <p className="text-xs text-gray-500">open violations</p>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* Run history */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            Run History
          </h2>
          <a
            href={`/runs?appId=${appId}&environment=${environment}`}
            className="text-xs text-brand-600 hover:underline"
          >
            View all →
          </a>
        </div>
        <RunTable runs={runs} loading={loading} />
      </section>
    </div>
  );
}

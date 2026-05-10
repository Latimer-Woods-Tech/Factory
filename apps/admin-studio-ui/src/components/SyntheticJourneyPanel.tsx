/**
 * SyntheticJourneyPanel — displays pass/fail status, failure evidence,
 * and outage classification for the journey probe suite (ADM-4).
 *
 * Data is fetched from /synthetic/journeys which probes worker endpoints.
 */
import { useEffect, useState } from 'react';
import { apiFetch, getApiBase } from '../lib/api.js';

type OutageClass = 'none' | 'partial' | 'full';
type JourneyStatus = 'pass' | 'fail' | 'skipped';

interface JourneyResult {
  id: string;
  label: string;
  status: JourneyStatus;
  latencyMs: number | null;
  failureEvidence: string | null;
  outageClass: OutageClass;
  checkedAt: string;
}

interface JourneyResp {
  degraded: boolean;
  providerStatus: 'ok' | 'error';
  retryable: boolean;
  env: string;
  checkedAt: string;
  outageClass: OutageClass;
  journeys: JourneyResult[];
  trend: Record<string, JourneyStatus[]>;
  note?: string;
  error?: string;
}

function outageBadgeClass(cls: OutageClass): string {
  switch (cls) {
    case 'none':
      return 'bg-emerald-600/20 text-emerald-300 border-emerald-700';
    case 'partial':
      return 'bg-amber-600/20 text-amber-300 border-amber-700';
    case 'full':
      return 'bg-red-600/20 text-red-300 border-red-700';
    default:
      return 'bg-slate-700/40 text-slate-300 border-slate-600';
  }
}

function journeyDotClass(status: JourneyStatus): string {
  switch (status) {
    case 'pass':
      return 'bg-emerald-400';
    case 'fail':
      return 'bg-red-500';
    case 'skipped':
      return 'bg-slate-500';
  }
}

function trendDotClass(status: JourneyStatus): string {
  switch (status) {
    case 'pass':
      return 'bg-emerald-400';
    case 'fail':
      return 'bg-red-500';
    case 'skipped':
      return 'bg-slate-500';
  }
}

export function SyntheticJourneyPanel() {
  const [data, setData] = useState<JourneyResp | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const base = getApiBase();
    apiFetch<JourneyResp>(`${base}/synthetic/journeys`)
      .then(setData)
      .catch((e) => setErr((e as Error).message));
  }, []);

  return (
    <div className="@container rounded border border-slate-800 bg-slate-900 [container-type:inline-size] [container-name:synthetic-journey-panel]">
      <header className="flex flex-col items-start gap-2 border-b border-slate-800 px-4 py-2 @[20rem]:flex-row @[20rem]:items-center @[20rem]:gap-3">
        <h2 className="text-sm font-semibold text-slate-200">Synthetic Journey Monitor</h2>
        {data && (
          <span
            className={`rounded border px-2 py-0.5 text-xs capitalize ${outageBadgeClass(data.outageClass)}`}
          >
            {data.outageClass}
          </span>
        )}
        {data?.checkedAt && (
          <span className="text-xs text-slate-500 @[20rem]:ml-auto">
            last run {new Date(data.checkedAt).toLocaleTimeString()}
          </span>
        )}
      </header>

      {err && <p className="px-4 py-3 text-sm text-red-400">{err}</p>}

      {data && data.providerStatus === 'error' && data.error && (
        <p className="px-4 py-3 text-xs text-amber-300">{data.error}</p>
      )}

      {data?.journeys && data.journeys.length > 0 && (
        <ul className="divide-y divide-slate-800">
          {data.journeys.map((journey) => (
            <li
              key={journey.id}
              className="flex flex-col items-start gap-2 px-4 py-2 text-sm @[20rem]:flex-row @[20rem]:flex-wrap @[20rem]:items-center"
            >
              <span className={`inline-block h-2 w-2 flex-shrink-0 rounded-full ${journeyDotClass(journey.status)}`} />
              <span className="font-mono text-xs text-slate-300">{journey.id}</span>
              <span className={`rounded border px-1.5 py-0.5 text-xs ${journey.status === 'pass' ? 'border-emerald-700 text-emerald-400' : journey.status === 'fail' ? 'border-red-700 text-red-400' : 'border-slate-700 text-slate-400'}`}>
                {journey.status}
              </span>
              {journey.latencyMs !== null && (
                <span className="text-xs text-slate-500">{journey.latencyMs}ms</span>
              )}
              {journey.status === 'fail' && journey.failureEvidence && (
                <span className="ml-1 truncate text-xs text-amber-300" title={journey.failureEvidence}>
                  {journey.failureEvidence.length > 80 ? `${journey.failureEvidence.slice(0, 80)}…` : journey.failureEvidence}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {data && data.journeys.length === 0 && (
        <p className="px-4 py-3 text-xs text-slate-500">{data.note || 'No journeys available for this environment.'}</p>
      )}

      {data?.trend && Object.keys(data.trend).length > 0 && (
        <div className="border-t border-slate-800 px-4 py-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Trend (recent runs)
          </h3>
          <div className="space-y-2">
            {Object.entries(data.trend).map(([journeyId, statuses]) => (
              <div key={journeyId} className="text-xs">
                <div className="text-slate-500 mb-1">{journeyId}</div>
                <div className="flex items-end gap-0.5">
                  {statuses.map((status, i) => (
                    <div
                      key={i}
                      className="group relative flex flex-col items-center"
                      title={status}
                    >
                      <span className={`inline-block h-4 w-2 rounded-sm ${trendDotClass(status)}`} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-600">Green = pass, red = fail, gray = skipped.</p>
        </div>
      )}

      {!data && !err && (
        <p className="px-4 py-6 text-sm text-slate-500">Loading…</p>
      )}
    </div>
  );
}

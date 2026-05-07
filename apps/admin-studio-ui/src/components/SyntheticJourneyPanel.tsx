/**
 * SyntheticJourneyPanel — displays pass/fail trend, failure evidence links,
 * and outage classification for the journey probe suite (ADM-4).
 *
 * Data is fetched from /observability/synthetic/journey which reads the latest
 * KV snapshot written by the synthetic-monitor Worker's scheduled handler.
 */
import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api.js';

type JourneyOutageClass = 'ok' | 'partial' | 'outage' | 'unknown';

interface JourneyProbe {
  id: string;
  ok: boolean;
  latencyMs: number;
  url?: string;
  error?: string;
}

interface JourneyTrendPoint {
  ts: string;
  status: 'ok' | 'degraded';
  journeyOk: number;
  journeyFailed: number;
}

interface JourneyResp {
  configured: boolean;
  note?: string;
  checkedAt?: string;
  outageClass: JourneyOutageClass;
  probes: JourneyProbe[];
  trend: JourneyTrendPoint[];
}

function outageBadgeClass(cls: JourneyOutageClass): string {
  switch (cls) {
    case 'ok':
      return 'bg-emerald-600/20 text-emerald-300 border-emerald-700';
    case 'partial':
      return 'bg-amber-600/20 text-amber-300 border-amber-700';
    case 'outage':
      return 'bg-red-600/20 text-red-300 border-red-700';
    default:
      return 'bg-slate-700/40 text-slate-300 border-slate-600';
  }
}

function probeDotClass(ok: boolean): string {
  return ok ? 'bg-emerald-400' : 'bg-red-500';
}

function trendDotClass(s: JourneyTrendPoint): string {
  if (s.journeyFailed === 0) return 'bg-emerald-400';
  if (s.journeyOk === 0) return 'bg-red-500';
  return 'bg-amber-400';
}

export function SyntheticJourneyPanel() {
  const [data, setData] = useState<JourneyResp | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<JourneyResp>('/observability/synthetic/journey')
      .then(setData)
      .catch((e) => setErr((e as Error).message));
  }, []);

  return (
    <div className="rounded border border-slate-800 bg-slate-900">
      <header className="flex items-center gap-3 border-b border-slate-800 px-4 py-2">
        <h2 className="text-sm font-semibold text-slate-200">Synthetic Journey Monitor</h2>
        {data && (
          <span
            className={`rounded border px-2 py-0.5 text-xs capitalize ${outageBadgeClass(data.outageClass)}`}
          >
            {data.outageClass}
          </span>
        )}
        {data?.checkedAt && (
          <span className="ml-auto text-xs text-slate-500">
            last run {new Date(data.checkedAt).toLocaleTimeString()}
          </span>
        )}
      </header>

      {err && <p className="px-4 py-3 text-sm text-red-400">{err}</p>}

      {data && !data.configured && (
        <p className="px-4 py-3 text-xs text-amber-300">{data.note}</p>
      )}

      {data?.configured && data.note && data.probes.length === 0 && (
        <p className="px-4 py-3 text-xs text-slate-500">{data.note}</p>
      )}

      {data?.probes && data.probes.length > 0 && (
        <ul className="divide-y divide-slate-800">
          {data.probes.map((probe) => (
            <li key={probe.id} className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm">
              <span className={`inline-block h-2 w-2 flex-shrink-0 rounded-full ${probeDotClass(probe.ok)}`} />
              <span className="font-mono text-xs text-slate-300">{probe.id}</span>
              <span className={`rounded border px-1.5 py-0.5 text-xs ${probe.ok ? 'border-emerald-700 text-emerald-400' : 'border-red-700 text-red-400'}`}>
                {probe.ok ? 'pass' : 'fail'}
              </span>
              <span className="text-xs text-slate-500">{probe.latencyMs}ms</span>
              {!probe.ok && probe.error && (
                <span className="ml-1 truncate text-xs text-amber-300" title={probe.error}>
                  {probe.error.length > 80 ? `${probe.error.slice(0, 80)}…` : probe.error}
                </span>
              )}
              {probe.url && (
                <a
                  href={probe.url}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-auto text-xs text-slate-500 hover:text-slate-300"
                >
                  evidence ↗
                </a>
              )}
            </li>
          ))}
        </ul>
      )}

      {data?.trend && data.trend.length > 0 && (
        <div className="border-t border-slate-800 px-4 py-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Pass / Fail Trend ({data.trend.length} runs)
          </h3>
          <div className="flex items-end gap-1">
            {[...data.trend].reverse().map((point) => (
              <div
                key={point.ts}
                className="group relative flex flex-col items-center"
                title={`${new Date(point.ts).toLocaleTimeString()} — ✓${point.journeyOk} ✗${point.journeyFailed}`}
              >
                <span
                  className={`inline-block h-4 w-3 rounded-sm ${trendDotClass(point)}`}
                />
              </div>
            ))}
          </div>
          <p className="mt-1 text-xs text-slate-600">Each bar = one cron cycle. Green = all probes ok, amber = partial, red = outage.</p>
        </div>
      )}

      {!data && !err && (
        <p className="px-4 py-6 text-sm text-slate-500">Loading…</p>
      )}
    </div>
  );
}

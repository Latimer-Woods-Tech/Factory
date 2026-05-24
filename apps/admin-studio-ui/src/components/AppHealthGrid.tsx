/**
 * AppHealthGrid — live grid of app /health checks.
 *
 * Polls /apps/health every `intervalMs`, sorted by status severity from the
 * server. Operators see broken apps at the top.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../lib/api.js';
import { statusBadgeClass, statusDotClass } from '../lib/status.js';
import { LastUpdated } from './LastUpdated.js';
import type { AppHealth } from '@latimer-woods-tech/studio-core';

interface Props {
  env: string;
  intervalMs?: number;
}

interface Resp {
  env: string;
  results: AppHealth[];
}

export function AppHealthGrid({ env, intervalMs = 30_000 }: Props) {
  const [data, setData] = useState<AppHealth[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  const load = useCallback(async (background = false) => {
    if (background) setIsRefreshing(true);
    controllerRef.current?.abort();
    controllerRef.current = new AbortController();
    try {
      const r = await apiFetch<Resp>(`/apps/health?env=${encodeURIComponent(env)}`, {
        signal: controllerRef.current.signal,
      });
      setData(r.results);
      setLoadedAt(Date.now());
      setErr(null);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setErr((e as Error).message);
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [env]);

  useEffect(() => {
    void load(false);
    const t = setInterval(() => void load(true), intervalMs);
    return () => {
      clearInterval(t);
      controllerRef.current?.abort();
    };
  }, [env, intervalMs, load]);

  return (
    <div className="@container rounded border border-slate-800 bg-slate-900 [container-type:inline-size] [container-name:app-health-grid]">
      <header className="flex flex-col gap-1 border-b border-slate-800 px-4 py-2 @[20rem]:flex-row @[20rem]:items-center @[20rem]:justify-between">
        <h2 className="text-sm font-semibold text-slate-200">App Health — {env}</h2>
        <LastUpdated at={loadedAt} isRefreshing={isRefreshing} onRefresh={() => void load(false)} />
      </header>
      {err && <p className="px-4 py-3 text-sm text-red-400">{err}</p>}
      <ul className="divide-y divide-slate-800">
        {data?.map((row) => {
          const drift = row.reportedEnv && row.reportedEnv !== row.env;
          return (
            <li
              key={`${row.id}-${row.env}`}
              className="flex flex-col items-start gap-2 px-4 py-3 text-sm @[20rem]:flex-row @[20rem]:items-center"
            >
              <span className={`inline-block h-2 w-2 rounded-full ${statusDotClass(row.status)}`} />
              <span className="font-medium text-white">{row.label}</span>
              <span className={`rounded border px-2 py-0.5 text-xs ${statusBadgeClass(row.status)}`}>
                {row.status}
              </span>
              <span className="text-xs text-slate-500">HTTP {row.httpStatus}</span>
              <span className="text-xs text-slate-500">{row.latencyMs}ms</span>
              {drift && (
                <span className="ml-2 rounded border border-red-700 bg-red-900/40 px-2 py-0.5 text-xs text-red-200">
                  env drift: reported {row.reportedEnv}
                </span>
              )}
              <a
                href={row.url}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-slate-500 hover:text-slate-300 @[20rem]:ml-auto"
              >
                {new URL(row.url).hostname}
              </a>
            </li>
          );
        })}
        {!err && data && data.length === 0 && (
          <li className="px-4 py-6 text-sm text-slate-500">No apps to monitor in this env.</li>
        )}
        {!data && !err && <li className="px-4 py-6 text-sm text-slate-500">Loading…</li>}
      </ul>
    </div>
  );
}

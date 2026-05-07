/**
 * DeployVersionsTable — cross-app Cloudflare deployment dashboard.
 *
 * Reads /apps/versions which proxies the Cloudflare API. When the Worker
 * isn't configured with CF_API_TOKEN, the table renders a clear setup hint
 * instead of failing.
 */
import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api.js';
import type { DeployVersion } from '@latimer-woods-tech/studio-core';

// Sentinel value returned by the backend when CF API has no deployment record.
const EPOCH_ISO = new Date(0).toISOString();
// Sentinel values returned when the CF API call itself fails.
const ERROR_SENTINELS = new Set(['unknown', 'error']);

interface Props {
  env: string;
}

interface Resp {
  env: string;
  configured: boolean;
  note?: string;
  results: DeployVersion[];
}

export function DeployVersionsTable({ env }: Props) {
  const [data, setData] = useState<Resp | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Resp>(`/apps/versions?env=${encodeURIComponent(env)}`)
      .then(setData)
      .catch((e) => setErr((e as Error).message));
  }, [env]);

  return (
    <div className="rounded border border-slate-800 bg-slate-900">
      <header className="border-b border-slate-800 px-4 py-2">
        <h2 className="text-sm font-semibold text-slate-200">Deploy Versions — {env}</h2>
      </header>
      {err && <p className="px-4 py-3 text-sm text-red-400">{err}</p>}
      {data && !data.configured && (
        <p className="px-4 py-3 text-sm text-amber-300">
          {data.note ?? 'Deploy version reads not configured.'}
        </p>
      )}
      {data && data.configured && (
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Worker</th>
              <th className="px-4 py-2">Version</th>
              <th className="px-4 py-2">Deployed</th>
              <th className="px-4 py-2">Source</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {data.results.map((row) => (
              <tr key={`${row.workerName}-${row.versionId}`}>
                <td className="px-4 py-2 font-medium text-white">{row.workerName}</td>
                <td className="px-4 py-2 font-mono text-xs text-slate-300">
                  {row.versionId.slice(0, 8)}
                </td>
                <td className="px-4 py-2 text-slate-400">
                  {row.deployedAt === EPOCH_ISO || ERROR_SENTINELS.has(row.versionId)
                    ? '—'
                    : new Date(row.deployedAt).toLocaleString()}
                </td>
                <td className="px-4 py-2 text-slate-500">{row.source ?? '—'}</td>
              </tr>
            ))}
            {data.results.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                  No deployments returned for this env.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
      {!data && !err && <p className="px-4 py-3 text-sm text-slate-500">Loading…</p>}
    </div>
  );
}

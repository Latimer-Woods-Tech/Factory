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
    <div className="@container rounded border border-slate-800 bg-slate-900 [container-type:inline-size] [container-name:deploy-versions-table]">
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
        <>
          <ul className="space-y-3 p-4 text-sm @[20rem]:hidden">
            {data.results.map((row) => (
              <li
                key={`${row.workerName}-${row.versionId}`}
                className="rounded border border-slate-800 bg-slate-950/50 p-3"
              >
                <dl className="space-y-1">
                  <div>
                    <dt className="text-xs uppercase text-slate-500">Worker</dt>
                    <dd className="font-medium text-white">{row.workerName}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase text-slate-500">Version</dt>
                    <dd className="font-mono text-xs text-slate-300">{row.versionId.slice(0, 8)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase text-slate-500">Deployed</dt>
                    <dd className="text-slate-400">
                      {row.deployedAt === EPOCH_ISO || ERROR_SENTINELS.has(row.versionId)
                        ? '—'
                        : new Date(row.deployedAt).toLocaleString()}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase text-slate-500">Source</dt>
                    <dd className="text-slate-500">{row.source ?? '—'}</dd>
                  </div>
                </dl>
              </li>
            ))}
            {data.results.length === 0 && (
              <li className="rounded border border-slate-800 bg-slate-950/50 px-4 py-6 text-center text-slate-500">
                No deployments returned for this env.
              </li>
            )}
          </ul>

          <div className="hidden overflow-x-auto @[20rem]:block">
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
          </div>
        </>
      )}
      {!data && !err && <p className="px-4 py-3 text-sm text-slate-500">Loading…</p>}
    </div>
  );
}

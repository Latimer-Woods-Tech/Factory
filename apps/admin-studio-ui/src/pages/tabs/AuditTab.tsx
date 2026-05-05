/**
 * AuditTab — paginated viewer over /audit.
 *
 * Server enforces authz (non-admins only see their own activity), so the
 * client just renders whatever rows it gets back. Filters are URL-driven
 * so an operator can deep-link an audit query.
 */
import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api.js';
import type { AuditEntry, AuditPage, Environment } from '@latimer-woods-tech/studio-core';

interface Filters {
  env: Environment | '';
  action: string;
  from: string;
  to: string;
}

const EMPTY_FILTERS: Filters = { env: '', action: '', from: '', to: '' };

function buildQuery(f: Filters, cursor: string | null): string {
  const p = new URLSearchParams();
  if (f.env) p.set('env', f.env);
  if (f.action.trim()) p.set('action', f.action.trim());
  if (f.from) p.set('from', f.from);
  if (f.to) p.set('to', f.to);
  if (cursor) p.set('cursor', cursor);
  const s = p.toString();
  return s ? `?${s}` : '';
}

export function AuditTab() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load(reset: boolean) {
    setLoading(true);
    setErr(null);
    try {
      const page = await apiFetch<AuditPage<AuditEntry>>(
        `/audit${buildQuery(filters, reset ? null : cursor)}`,
      );
      setRows((prev) => (reset ? page.rows : [...prev, ...page.rows]));
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
    setRows([]);
    setCursor(null);
    load(true);
  }

  function loadMore() {
    if (!nextCursor) return;
    setCursor(nextCursor);
    // microtask to ensure cursor state is committed before fetch
    setTimeout(() => load(false), 0);
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold text-white">Audit Log</h1>
        <p className="text-sm text-slate-400">
          Every mutating Studio request lands here. Server-side filters; non-admin viewers see only their own activity.
        </p>
      </header>

      <form
        onSubmit={applyFilters}
        className="grid grid-cols-1 gap-3 rounded border border-slate-800 bg-slate-900 p-4 md:grid-cols-5"
      >
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
        <label className="text-xs text-slate-400 md:col-span-2">
          action contains
          <input
            value={filters.action}
            onChange={(e) => setFilters({ ...filters, action: e.target.value })}
            placeholder="e.g. /deploys"
            className="mt-1 w-full rounded bg-slate-950 border border-slate-700 px-2 py-1 text-sm text-white"
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
        <div className="md:col-span-5 flex gap-2">
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
              setRows([]);
              setCursor(null);
              setTimeout(() => load(true), 0);
            }}
            className="rounded bg-slate-700 hover:bg-slate-600 px-3 py-1.5 text-sm text-white"
          >
            Reset
          </button>
        </div>
      </form>

      {err && (
        <div className="rounded border border-red-700 bg-red-900/30 p-3 text-sm text-red-300">{err}</div>
      )}

      <div className="overflow-auto rounded border border-slate-800 bg-slate-900">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Time</th>
              <th className="px-3 py-2">Env</th>
              <th className="px-3 py-2">User</th>
              <th className="px-3 py-2">Action</th>
              <th className="px-3 py-2">Reversibility</th>
              <th className="px-3 py-2">Result</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-800/50">
                <td className="px-3 py-1.5 text-slate-300 whitespace-nowrap">
                  {new Date(r.occurredAt).toLocaleString()}
                </td>
                <td className="px-3 py-1.5 text-slate-300">{r.env}</td>
                <td className="px-3 py-1.5 text-slate-300">{r.userEmail}</td>
                <td className="px-3 py-1.5 font-mono text-xs text-white">{r.action}</td>
                <td className="px-3 py-1.5 text-slate-400">{r.reversibility}</td>
                <td className="px-3 py-1.5">
                  <span
                    className={
                      r.result === 'success'
                        ? 'text-emerald-400'
                        : r.result === 'dry-run'
                          ? 'text-slate-400'
                          : 'text-red-400'
                    }
                  >
                    {r.result}
                  </span>
                </td>
              </tr>
            ))}
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                  No entries match these filters.
                </td>
              </tr>
            )}
            {loading && (
              <tr>
                <td colSpan={6} className="px-3 py-3 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            )}
          </tbody>
        </table>
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

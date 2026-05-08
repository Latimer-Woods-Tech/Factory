/**
 * FlagsTab — FLG-3 Flagship Ops Panel
 *
 * Browse all flags from the registry with 24h eval stats.
 * Toggle flags (admin/owner only) and set rollout percentages.
 * Activity feed shows the last 50 evaluations from FLAG_TELEMETRY.
 */
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api.js';
import { useSession } from '../../stores/session.js';

// ── Types ─────────────────────────────────────────────────────────────────────

type FlagType = 'kill_switch' | 'rollout' | 'experiment' | 'ops' | 'config';
type FlagStatus = 'active' | 'draft' | 'archived';

interface FlagStats {
  evals_24h: number;
  fallback_rate: number;
}

interface FlagRow {
  key: string;
  type: FlagType;
  description: string;
  apps: string[];
  owner: string;
  status: FlagStatus;
  default: boolean | string | number;
  variations?: string[];
  created_at: string;
  cleanup_policy: string;
  stats: FlagStats;
}

interface FlagsListResponse {
  flags: FlagRow[];
  total: number;
  generated_at: string;
}

interface EvaluationRow {
  id: string;
  flag_key: string;
  app: string;
  user_id: string | null;
  plan: string | null;
  env: string;
  result: string;
  default_hit: number;
  ts: number;
}

interface ActivityResponse {
  evaluations: EvaluationRow[];
  count: number;
  generated_at: string;
  degraded?: boolean;
  error?: string;
}

interface ToggleResponse {
  key: string;
  previous_status: string;
  new_status: string;
  actor: string;
  note: string;
  toggled_at: string;
}

interface RolloutResponse {
  key: string;
  percentage: number;
  actor: string;
  note: string;
  updated_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TYPE_LABEL: Record<FlagType, string> = {
  kill_switch: 'Kill Switch',
  rollout: 'Rollout',
  experiment: 'Experiment',
  ops: 'Ops Override',
  config: 'Config',
};

const TYPE_COLOR: Record<FlagType, string> = {
  kill_switch: 'bg-red-900 text-red-200',
  rollout: 'bg-blue-900 text-blue-200',
  experiment: 'bg-purple-900 text-purple-200',
  ops: 'bg-amber-900 text-amber-200',
  config: 'bg-slate-700 text-slate-200',
};

const STATUS_COLOR: Record<FlagStatus, string> = {
  active: 'text-green-400',
  draft: 'text-amber-400',
  archived: 'text-slate-500',
};

function pct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function relTime(ts: number): string {
  const diffMs = Date.now() - ts;
  const diffS = Math.floor(diffMs / 1000);
  if (diffS < 60) return `${diffS}s ago`;
  const diffM = Math.floor(diffS / 60);
  if (diffM < 60) return `${diffM}m ago`;
  const diffH = Math.floor(diffM / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return `${Math.floor(diffH / 24)}d ago`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function FlagsTab() {
  const { user } = useSession();
  const isAdmin = user?.role === 'admin' || user?.role === 'owner';

  // ── Flag list state ────────────────────────────────────────────────────────
  const [flags, setFlags] = useState<FlagRow[]>([]);
  const [flagsErr, setFlagsErr] = useState<string | null>(null);
  const [flagsLoading, setFlagsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<FlagType | ''>('');
  const [statusFilter, setStatusFilter] = useState<FlagStatus | ''>('');

  // ── Activity state ────────────────────────────────────────────────────────
  const [activity, setActivity] = useState<EvaluationRow[]>([]);
  const [activityErr, setActivityErr] = useState<string | null>(null);
  const [activityLoading, setActivityLoading] = useState(true);

  // ── Toggle / rollout state ────────────────────────────────────────────────
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [rolloutInputs, setRolloutInputs] = useState<Record<string, string>>({});

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadFlags = useCallback(async () => {
    setFlagsLoading(true);
    setFlagsErr(null);
    try {
      const data = await apiFetch<FlagsListResponse>('/api/flags');
      setFlags(data.flags);
    } catch (e) {
      setFlagsErr((e as Error).message);
    } finally {
      setFlagsLoading(false);
    }
  }, []);

  const loadActivity = useCallback(async () => {
    setActivityLoading(true);
    setActivityErr(null);
    try {
      const data = await apiFetch<ActivityResponse>('/api/flags/activity');
      if (data.degraded) {
        setActivityErr(data.error ?? 'FLAG_TELEMETRY unavailable');
      } else {
        setActivity(data.evaluations);
      }
    } catch (e) {
      setActivityErr((e as Error).message);
    } finally {
      setActivityLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFlags();
    void loadActivity();
  }, [loadFlags, loadActivity]);

  // ── Actions ───────────────────────────────────────────────────────────────

  async function handleToggle(key: string) {
    setActionLoading(key);
    setActionMsg(null);
    setActionErr(null);
    try {
      const res = await apiFetch<ToggleResponse>(
        `/api/flags/${encodeURIComponent(key)}/toggle`,
        { method: 'POST' },
      );
      setActionMsg(`Toggle recorded for ${key}: ${res.previous_status} → ${res.new_status}. ${res.note}`);
      await loadFlags();
      await loadActivity();
    } catch (e) {
      setActionErr(`Toggle failed: ${(e as Error).message}`);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRollout(key: string) {
    const raw = rolloutInputs[key] ?? '';
    const percentage = parseFloat(raw);
    if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
      setActionErr('Percentage must be a number between 0 and 100');
      return;
    }
    setActionLoading(`rollout:${key}`);
    setActionMsg(null);
    setActionErr(null);
    try {
      const res = await apiFetch<RolloutResponse>(
        `/api/flags/${encodeURIComponent(key)}/rollout`,
        { method: 'POST', body: JSON.stringify({ percentage }) },
      );
      setActionMsg(`Rollout set to ${res.percentage}% for ${key}. ${res.note}`);
      await loadActivity();
    } catch (e) {
      setActionErr(`Rollout update failed: ${(e as Error).message}`);
    } finally {
      setActionLoading(null);
    }
  }

  // ── Filtering ─────────────────────────────────────────────────────────────

  const visibleFlags = flags.filter((f) => {
    const q = search.trim().toLowerCase();
    if (q && !f.key.toLowerCase().includes(q) && !f.description.toLowerCase().includes(q)) {
      return false;
    }
    if (typeFilter && f.type !== typeFilter) return false;
    if (statusFilter && f.status !== statusFilter) return false;
    return true;
  });

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Flagship Ops Panel</h2>
        <button
          onClick={() => { void loadFlags(); void loadActivity(); }}
          className="rounded bg-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-600"
        >
          Refresh
        </button>
      </div>

      {/* Action feedback */}
      {actionMsg && (
        <div className="rounded border border-green-700 bg-green-950 px-4 py-2 text-sm text-green-300">
          {actionMsg}
        </div>
      )}
      {actionErr && (
        <div className="rounded border border-red-700 bg-red-950 px-4 py-2 text-sm text-red-300">
          {actionErr}
        </div>
      )}

      {/* ── Flag list ─────────────────────────────────────────────────────── */}
      <section>
        <h3 className="mb-3 text-sm font-medium text-slate-300">
          Flag Registry {flags.length > 0 && <span className="ml-1 text-slate-500">({flags.length})</span>}
        </h3>

        {/* Filters */}
        <div className="mb-3 flex flex-wrap gap-2">
          <input
            type="text"
            placeholder="Search key or description…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-base md:text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-600"
          />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as FlagType | '')}
            className="rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-slate-600"
          >
            <option value="">All types</option>
            {(Object.keys(TYPE_LABEL) as FlagType[]).map((t) => (
              <option key={t} value={t}>{TYPE_LABEL[t]}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as FlagStatus | '')}
            className="rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-slate-600"
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="draft">Draft</option>
            <option value="archived">Archived</option>
          </select>
        </div>

        {flagsLoading && <p className="text-sm text-slate-400">Loading flags…</p>}
        {flagsErr && (
          <p className="text-sm text-red-400">Failed to load flags: {flagsErr}</p>
        )}

        {!flagsLoading && !flagsErr && (
          <div className="overflow-x-auto rounded border border-slate-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900 text-left text-xs text-slate-400">
                  <th className="px-3 py-2">Key</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Apps</th>
                  <th className="px-3 py-2 text-right">24h Evals</th>
                  <th className="px-3 py-2 text-right">Fallback Rate</th>
                  {isAdmin && <th className="px-3 py-2 text-center">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {visibleFlags.length === 0 && (
                  <tr>
                    <td colSpan={isAdmin ? 7 : 6} className="px-3 py-4 text-center text-slate-500">
                      No flags match filters.
                    </td>
                  </tr>
                )}
                {visibleFlags.map((flag) => (
                  <tr
                    key={flag.key}
                    className="border-b border-slate-800 hover:bg-slate-900/50"
                  >
                    <td className="px-3 py-2">
                      <div className="font-mono text-xs text-slate-100">{flag.key}</div>
                      <div className="mt-0.5 text-xs text-slate-400">{flag.description}</div>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${TYPE_COLOR[flag.type]}`}>
                        {TYPE_LABEL[flag.type]}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`text-xs font-medium ${STATUS_COLOR[flag.status]}`}>
                        {flag.status}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="text-xs text-slate-400">
                        {flag.apps.join(', ')}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-slate-300">
                      {flag.stats.evals_24h.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-slate-300">
                      {pct(flag.stats.fallback_rate)}
                    </td>
                    {isAdmin && (
                      <td className="px-3 py-2">
                        <div className="flex flex-col gap-1.5">
                          {/* Toggle button */}
                          <button
                            onClick={() => void handleToggle(flag.key)}
                            disabled={actionLoading === flag.key}
                            className="rounded bg-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-600 disabled:opacity-50"
                          >
                            {actionLoading === flag.key ? '…' : flag.status === 'active' ? 'Disable' : 'Enable'}
                          </button>

                          {/* Rollout slider (rollout-type flags only) */}
                          {flag.type === 'rollout' && (
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min={0}
                                max={100}
                                step={1}
                                placeholder="0–100"
                                value={rolloutInputs[flag.key] ?? ''}
                                onChange={(e) =>
                                  setRolloutInputs((prev) => ({ ...prev, [flag.key]: e.target.value }))
                                }
                                className="w-16 rounded border border-slate-600 bg-slate-800 px-1.5 py-0.5 text-base md:text-xs text-slate-200 focus:outline-none"
                              />
                              <button
                                onClick={() => void handleRollout(flag.key)}
                                disabled={actionLoading === `rollout:${flag.key}`}
                                className="rounded bg-blue-700 px-2 py-0.5 text-xs text-blue-100 hover:bg-blue-600 disabled:opacity-50"
                              >
                                {actionLoading === `rollout:${flag.key}` ? '…' : 'Set %'}
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Activity feed ─────────────────────────────────────────────────── */}
      <section>
        <h3 className="mb-3 text-sm font-medium text-slate-300">
          Recent Evaluations
          {activity.length > 0 && <span className="ml-1 text-slate-500">(last {activity.length})</span>}
        </h3>

        {activityLoading && <p className="text-sm text-slate-400">Loading activity…</p>}
        {activityErr && (
          <p className="text-sm text-amber-400">Activity unavailable: {activityErr}</p>
        )}

        {!activityLoading && !activityErr && activity.length === 0 && (
          <p className="text-sm text-slate-500">No evaluations recorded yet.</p>
        )}

        {!activityLoading && !activityErr && activity.length > 0 && (
          <div className="overflow-x-auto rounded border border-slate-800">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900 text-left text-slate-400">
                  <th className="px-3 py-2">Flag Key</th>
                  <th className="px-3 py-2">App</th>
                  <th className="px-3 py-2">Result</th>
                  <th className="px-3 py-2">Fallback</th>
                  <th className="px-3 py-2">Env</th>
                  <th className="px-3 py-2">User</th>
                  <th className="px-3 py-2 text-right">Time</th>
                </tr>
              </thead>
              <tbody>
                {activity.map((row) => (
                  <tr key={row.id} className="border-b border-slate-800 hover:bg-slate-900/50">
                    <td className="px-3 py-1.5 font-mono text-slate-100">{row.flag_key}</td>
                    <td className="px-3 py-1.5 text-slate-300">{row.app}</td>
                    <td className="px-3 py-1.5">
                      <span className="font-mono text-slate-200">{row.result}</span>
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      {row.default_hit === 1 ? (
                        <span className="text-amber-400">yes</span>
                      ) : (
                        <span className="text-green-400">no</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-slate-400">{row.env}</td>
                    <td className="px-3 py-1.5 font-mono text-slate-400">
                      {row.user_id ?? '—'}
                    </td>
                    <td className="px-3 py-1.5 text-right text-slate-500">
                      {relTime(row.ts)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

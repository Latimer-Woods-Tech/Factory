import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  Clock3,
  ExternalLink,
  GitPullRequest,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import { apiFetch } from '../../lib/api.js';

interface BlockingGate {
  id: string;
  gate_type: string;
  source_system: string;
  source_ref: string;
  subject_type: string;
  subject_repo: string | null;
  subject_ref: string;
  state: 'pending' | 'failed' | string;
  evidence_url: string | null;
  observed_at: string;
}

interface RunRow {
  id: string;
  template_id: string;
  template_version: number;
  description: string;
  source: string;
  status: string;
  dry_run: boolean;
  pr_url: string | null;
  started_at: string;
  gates_passed: number;
  gates_failed: number;
  gates_pending: number;
  deploy_url: string | null;
}

interface GateRow {
  id: string;
  gate_type: string;
  source_system: string;
  source_ref: string;
  subject_type: string;
  subject_repo: string | null;
  subject_ref: string;
  state: string;
  evidence_url: string | null;
  observed_at: string;
}

interface BlockingResponse {
  gates: BlockingGate[];
  note?: string;
}

interface RunsResponse {
  runs: RunRow[];
  note?: string;
}

interface GatesResponse {
  gates: GateRow[];
  note?: string;
}

interface CommandCenterData {
  blocking: BlockingResponse;
  runs: RunsResponse;
  gates: GatesResponse;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'ok'; data: CommandCenterData; loadedAt: Date }
  | { status: 'error'; message: string };

const EMPTY_DATA: CommandCenterData = {
  blocking: { gates: [] },
  runs: { runs: [] },
  gates: { gates: [] },
};

function ageLabel(value: string | null | undefined): string {
  if (!value) return 'n/a';
  const ms = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 'n/a';
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function compactRef(value: string | null | undefined): string {
  if (!value) return 'n/a';
  if (value.length <= 42) return value;
  return `${value.slice(0, 18)}...${value.slice(-16)}`;
}

function stateBadgeClass(state: string): string {
  switch (state) {
    case 'passed':
    case 'success':
    case 'completed':
      return 'border-emerald-700 bg-emerald-950/50 text-emerald-300';
    case 'failed':
    case 'failure':
    case 'failed_verifier':
      return 'border-rose-700 bg-rose-950/50 text-rose-300';
    case 'pending':
    case 'running':
    case 'in_progress':
      return 'border-amber-700 bg-amber-950/50 text-amber-300';
    default:
      return 'border-slate-700 bg-slate-950 text-slate-300';
  }
}

function priorityRank(gate: BlockingGate): number {
  if (gate.state === 'failed') return 0;
  if (gate.gate_type.includes('budget')) return 1;
  if (gate.gate_type.includes('codeowner')) return 2;
  return 3;
}

function notesFrom(data: CommandCenterData): string[] {
  return [
    data.blocking.note,
    data.runs.note,
    data.gates.note,
  ].filter((note): note is string => Boolean(note));
}

async function loadCommandCenter(): Promise<CommandCenterData> {
  const [blocking, runs, gates] = await Promise.allSettled([
    apiFetch<BlockingResponse>('/v1/blocking'),
    apiFetch<RunsResponse>('/v1/command-center/runs?limit=8'),
    apiFetch<GatesResponse>('/v1/command-center/gates?limit=12'),
  ]);

  return {
    blocking: blocking.status === 'fulfilled' ? blocking.value : {
      gates: [],
      note: blocking.reason instanceof Error ? blocking.reason.message : 'Blocking gates unavailable',
    },
    runs: runs.status === 'fulfilled' ? runs.value : {
      runs: [],
      note: runs.reason instanceof Error ? runs.reason.message : 'Runs unavailable',
    },
    gates: gates.status === 'fulfilled' ? gates.value : {
      gates: [],
      note: gates.reason instanceof Error ? gates.reason.message : 'Gate stream unavailable',
    },
  };
}

function KpiTile({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: string;
  tone: 'neutral' | 'good' | 'warn' | 'bad';
  icon: ReactNode;
}) {
  const toneClass = {
    neutral: 'border-slate-800 bg-slate-900 text-slate-300',
    good: 'border-emerald-800 bg-emerald-950/30 text-emerald-300',
    warn: 'border-amber-800 bg-amber-950/30 text-amber-300',
    bad: 'border-rose-800 bg-rose-950/30 text-rose-300',
  }[tone];

  return (
    <div className={`rounded border p-4 ${toneClass}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs uppercase tracking-wide text-slate-500">{label}</span>
        <span className="text-slate-400">{icon}</span>
      </div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded border border-slate-800 bg-slate-900">
      <div className="border-b border-slate-800 px-4 py-3">
        <h2 className="text-sm font-semibold text-white">{title}</h2>
      </div>
      <div>{children}</div>
    </section>
  );
}

function EmptyRow({ label }: { label: string }) {
  return <div className="px-4 py-8 text-center text-sm text-slate-500">{label}</div>;
}

function ExternalAnchor({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-xs text-sky-300 hover:text-sky-200"
    >
      {label}
      <ExternalLink className="h-3 w-3" aria-hidden="true" />
    </a>
  );
}

function OperatorQueue({ gates }: { gates: BlockingGate[] }) {
  const sorted = [...gates].sort((a, b) => {
    const priority = priorityRank(a) - priorityRank(b);
    if (priority !== 0) return priority;
    return new Date(b.observed_at).getTime() - new Date(a.observed_at).getTime();
  });

  return (
    <Section title="Operator Queue">
      {sorted.length === 0 ? (
        <EmptyRow label="No blocking gates." />
      ) : (
        <ul className="divide-y divide-slate-800">
          {sorted.map((gate) => (
            <li key={gate.id} className="px-4 py-3">
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded border px-2 py-0.5 text-xs ${stateBadgeClass(gate.state)}`}>
                      {gate.state}
                    </span>
                    <span className="text-sm font-medium text-white">{gate.gate_type}</span>
                  </div>
                  <p className="mt-1 truncate text-xs text-slate-400">
                    {gate.subject_type}/{compactRef(gate.subject_ref)}
                    {gate.subject_repo ? ` - ${gate.subject_repo}` : ''}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {gate.source_system} / {compactRef(gate.source_ref)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3 text-xs text-slate-500">
                  <span>{ageLabel(gate.observed_at)}</span>
                  {gate.evidence_url && <ExternalAnchor href={gate.evidence_url} label="Evidence" />}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function RunsPanel({ runs }: { runs: RunRow[] }) {
  return (
    <Section title="Recent Runs">
      {runs.length === 0 ? (
        <EmptyRow label="No mirrored runs." />
      ) : (
        <ul className="divide-y divide-slate-800">
          {runs.map((run) => (
            <li key={run.id} className="px-4 py-3">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded border px-2 py-0.5 text-xs ${stateBadgeClass(run.status)}`}>
                      {run.status}
                    </span>
                    {run.dry_run && (
                      <span className="rounded border border-slate-700 bg-slate-950 px-2 py-0.5 text-xs text-slate-300">
                        dry run
                      </span>
                    )}
                    <span className="text-sm font-medium text-white">{run.template_id}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-slate-400">{run.description}</p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                    <span>{run.gates_passed} passed</span>
                    <span>{run.gates_failed} failed</span>
                    <span>{run.gates_pending} pending</span>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-3 text-xs text-slate-500">
                  <span>{ageLabel(run.started_at)}</span>
                  {run.pr_url && <ExternalAnchor href={run.pr_url} label="PR" />}
                  {run.deploy_url && <ExternalAnchor href={run.deploy_url} label="Deploy" />}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function GatesPanel({ gates }: { gates: GateRow[] }) {
  return (
    <Section title="Gate Stream">
      {gates.length === 0 ? (
        <EmptyRow label="No gate transitions." />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="border-b border-slate-800 text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">State</th>
                <th className="px-4 py-2 font-medium">Gate</th>
                <th className="px-4 py-2 font-medium">Subject</th>
                <th className="px-4 py-2 font-medium">Observed</th>
                <th className="px-4 py-2 font-medium">Link</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {gates.map((gate) => (
                <tr key={gate.id}>
                  <td className="whitespace-nowrap px-4 py-2">
                    <span className={`rounded border px-2 py-0.5 ${stateBadgeClass(gate.state)}`}>
                      {gate.state}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-slate-200">{gate.gate_type}</td>
                  <td className="max-w-[18rem] truncate px-4 py-2 text-slate-400">
                    {gate.subject_repo ? `${gate.subject_repo} / ` : ''}
                    {compactRef(gate.subject_ref)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-slate-500">{ageLabel(gate.observed_at)}</td>
                  <td className="whitespace-nowrap px-4 py-2">
                    {gate.evidence_url ? <ExternalAnchor href={gate.evidence_url} label="Open" /> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

export function CommandCenterTab() {
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' });
  const [refreshing, setRefreshing] = useState(false);

  async function refresh() {
    setRefreshing(true);
    setLoadState((current) => (current.status === 'ok' ? current : { status: 'loading' }));
    try {
      const data = await loadCommandCenter();
      setLoadState({ status: 'ok', data, loadedAt: new Date() });
    } catch (e) {
      setLoadState({ status: 'error', message: (e as Error).message });
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const data = loadState.status === 'ok' ? loadState.data : EMPTY_DATA;
  const notes = useMemo(() => notesFrom(data), [data]);
  const failedBlocking = data.blocking.gates.filter((gate) => gate.state === 'failed').length;
  const pendingBlocking = data.blocking.gates.filter((gate) => gate.state !== 'failed').length;
  const activeRuns = data.runs.runs.filter((run) =>
    ['pending', 'running', 'in_progress'].includes(run.status),
  ).length;

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Command Center</h1>
        </div>
        <div className="flex items-center gap-3">
          {loadState.status === 'ok' && (
            <span className="text-xs text-slate-500">Updated {loadState.loadedAt.toLocaleTimeString()}</span>
          )}
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            className="inline-flex min-h-[2.25rem] items-center gap-2 rounded border border-slate-700 bg-slate-900 px-3 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
            Refresh
          </button>
        </div>
      </header>

      {loadState.status === 'error' && (
        <div className="rounded border border-rose-800 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">
          {loadState.message}
        </div>
      )}

      {notes.length > 0 && (
        <div className="rounded border border-amber-800 bg-amber-950/30 px-4 py-3 text-xs text-amber-200">
          {notes[0]}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <KpiTile
          label="Blocking"
          value={String(data.blocking.gates.length)}
          tone={data.blocking.gates.length > 0 ? 'bad' : 'good'}
          icon={<ShieldAlert className="h-4 w-4" aria-hidden="true" />}
        />
        <KpiTile
          label="Failed"
          value={String(failedBlocking)}
          tone={failedBlocking > 0 ? 'bad' : 'good'}
          icon={<AlertTriangle className="h-4 w-4" aria-hidden="true" />}
        />
        <KpiTile
          label="Pending"
          value={String(pendingBlocking)}
          tone={pendingBlocking > 0 ? 'warn' : 'good'}
          icon={<Clock3 className="h-4 w-4" aria-hidden="true" />}
        />
        <KpiTile
          label="Active Runs"
          value={String(activeRuns)}
          tone={activeRuns > 0 ? 'warn' : 'neutral'}
          icon={<GitPullRequest className="h-4 w-4" aria-hidden="true" />}
        />
      </div>

      {loadState.status === 'loading' ? (
        <div className="rounded border border-slate-800 bg-slate-900 px-4 py-8 text-center text-sm text-slate-500">
          Loading command state...
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div className="space-y-4">
            <OperatorQueue gates={data.blocking.gates} />
            <RunsPanel runs={data.runs.runs} />
          </div>
          <div className="space-y-4">
            <GatesPanel gates={data.gates.gates} />
          </div>
        </div>
      )}

    </div>
  );
}

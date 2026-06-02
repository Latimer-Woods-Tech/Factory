import { useCallback, useEffect, useState } from 'react';
import { Button } from '../../components/ui/button.js';

interface CouncilEntry {
  id: string;
  title: string;
  status: string;
  owner: string;
  dueDate: string | null;
  created: string | null;
  hasDeliberation: boolean;
  isStale: boolean;
  file: string;
}

interface CouncilState {
  generatedAt: string;
  active: CouncilEntry[];
  historical: CouncilEntry[];
  staleCount: number;
  totalCount: number;
}

const GITHUB_BASE = 'https://github.com/latimer-woods-tech/Factory/blob/main/docs/council';
const NEW_INQUIRY_URL = 'https://github.com/latimer-woods-tech/Factory/blob/main/docs/council/README.md';

const STATUS_CLASS: Record<string, string> = {
  draft:      'bg-slate-700 text-slate-200',
  review:     'bg-yellow-900/60 text-yellow-200',
  approved:   'bg-green-900/60 text-green-200',
  deferred:   'bg-blue-900/60 text-blue-200',
  rejected:   'bg-red-900/60 text-red-200',
  superseded: 'bg-slate-700 text-slate-400',
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_CLASS[status] ?? 'bg-slate-700 text-slate-200';
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}

function InquiryRow({ entry, showDue }: { entry: CouncilEntry; showDue?: boolean }) {
  const fileSlug = entry.file.replace('.md', '');
  const href = `${GITHUB_BASE}/inquiries/${entry.file}`;
  return (
    <tr className="border-b border-border transition-colors hover:bg-muted/10">
      <td className="whitespace-nowrap py-2.5 pl-4 pr-3 text-sm font-mono text-slate-400">
        {entry.id}
      </td>
      <td className="py-2.5 pr-4 text-sm">
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-slate-100 hover:text-blue-400 hover:underline"
        >
          {entry.title}
        </a>
        {entry.isStale && (
          <span className="ml-2 inline-flex items-center rounded bg-orange-900/60 px-1.5 py-0.5 text-xs text-orange-200">
            stale
          </span>
        )}
        {entry.hasDeliberation && (
          <span className="ml-2 inline-flex items-center rounded bg-purple-900/40 px-1.5 py-0.5 text-xs text-purple-300">
            deliberated
          </span>
        )}
      </td>
      <td className="whitespace-nowrap py-2.5 pr-4">
        <StatusBadge status={entry.status} />
      </td>
      <td className="whitespace-nowrap py-2.5 pr-4 text-sm text-slate-400">
        {entry.owner}
      </td>
      {showDue && (
        <td className="whitespace-nowrap py-2.5 pr-4 text-sm text-slate-400">
          {entry.dueDate ?? '—'}
        </td>
      )}
    </tr>
  );
}

export function CouncilTab() {
  const [state, setState] = useState<CouncilState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadState = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/council-state.json', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status} loading council-state.json`);
      const data = (await res.json()) as CouncilState;
      setState(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  const generatedAt = state?.generatedAt
    ? new Date(state.generatedAt).toLocaleString()
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Council</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            Cross-cutting governance inquiries with multi-voice LLM deliberation.
            Inquiries drive architectural decisions, feature gating, and platform experiments.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={loadState}>
            Refresh
          </Button>
          <Button
            size="sm"
            asChild
          >
            <a href={NEW_INQUIRY_URL} target="_blank" rel="noopener noreferrer">
              New Inquiry
            </a>
          </Button>
        </div>
      </header>

      {/* Error */}
      {error ? (
        <div className="rounded border border-red-700 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          {error}
          {error.includes('council-state.json') && (
            <p className="mt-1 text-red-300">
              Run <code className="rounded bg-red-950 px-1">node scripts/council.mjs list --json</code> to
              generate the state file, then redeploy.
            </p>
          )}
        </div>
      ) : null}

      {/* Loading */}
      {loading && !error ? (
        <p className="text-sm text-slate-500">Loading council state…</p>
      ) : null}

      {/* Stale alert */}
      {state && state.staleCount > 0 ? (
        <div className="flex items-start gap-2 rounded border border-orange-700 bg-orange-950/30 px-4 py-3 text-sm text-orange-200">
          <span className="mt-0.5 shrink-0 text-base">⚠</span>
          <span>
            <strong>{state.staleCount}</strong> inquiry{state.staleCount !== 1 ? 'ies' : 'y'} past desired decision
            date. Run{' '}
            <code className="rounded bg-orange-950 px-1">node scripts/council.mjs stale</code> for details.
          </span>
        </div>
      ) : null}

      {/* Stat pills */}
      {state ? (
        <div className="flex flex-wrap gap-3">
          {[
            { label: 'Total', value: state.totalCount },
            { label: 'Active', value: state.active.length },
            { label: 'Historical', value: state.historical.length },
            { label: 'Stale', value: state.staleCount, warn: state.staleCount > 0 },
          ].map(({ label, value, warn }) => (
            <div
              key={label}
              className={`rounded-lg border px-4 py-2 text-center ${
                warn ? 'border-orange-700 bg-orange-950/30' : 'border-border bg-muted/20'
              }`}
            >
              <p className="text-2xl font-semibold text-white">{value}</p>
              <p className="text-xs text-slate-400">{label}</p>
            </div>
          ))}
        </div>
      ) : null}

      {/* Active inquiries */}
      {state ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
            Active inquiries
          </h2>
          {state.active.length === 0 ? (
            <p className="text-sm text-slate-500">No active inquiries.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-left">
                <thead className="bg-muted/30 text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="py-2 pl-4 pr-3">ID</th>
                    <th className="py-2 pr-4">Title</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Owner</th>
                    <th className="py-2 pr-4">Due</th>
                  </tr>
                </thead>
                <tbody>
                  {state.active.map(e => (
                    <InquiryRow key={e.id} entry={e} showDue />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {/* Historical inquiries */}
      {state && state.historical.length > 0 ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
            Historical decisions
          </h2>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left">
              <thead className="bg-muted/30 text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="py-2 pl-4 pr-3">ID</th>
                  <th className="py-2 pr-4">Title</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Owner</th>
                </tr>
              </thead>
              <tbody>
                {state.historical.map(e => (
                  <InquiryRow key={e.id} entry={e} />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* Footer */}
      {generatedAt ? (
        <p className="text-xs text-slate-600">
          State generated {generatedAt}. Re-generate:{' '}
          <code className="rounded bg-slate-800 px-1">node scripts/council.mjs list --json</code>
        </p>
      ) : null}
    </div>
  );
}

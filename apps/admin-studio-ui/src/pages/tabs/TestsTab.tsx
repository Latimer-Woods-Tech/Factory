import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  TestEvent,
  TestResult,
  TestRun,
  TestRunStatus,
} from '@latimer-woods-tech/studio-core';
import { apiFetch } from '../../lib/api.js';
import { ConfirmDialog } from '../../components/ConfirmDialog.js';
import { useSession } from '../../stores/session.js';

interface Suite {
  id: string;
  name: string;
  path: string;
}

interface AnalystSuggestion {
  hypothesis: string;
  steps: readonly string[];
  confidence: number;
}

const STATUS_COLOUR: Record<TestRunStatus, string> = {
  queued: 'bg-slate-600',
  dispatched: 'bg-blue-600',
  running: 'bg-amber-500',
  passed: 'bg-emerald-600',
  failed: 'bg-rose-600',
  cancelled: 'bg-slate-500',
  'timed-out': 'bg-rose-700',
};

const API_BASE = (import.meta.env.VITE_API_BASE ?? '/api') as string;

export function TestsTab() {
  const [suites, setSuites] = useState<Suite[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [run, setRun] = useState<TestRun | null>(null);
  const [results, setResults] = useState<Map<string, TestResult>>(new Map());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [analyses, setAnalyses] = useState<Map<string, AnalystSuggestion>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const sourceRef = useRef<EventSource | null>(null);
  const token = useSession((s) => s.token);

  useEffect(() => {
    apiFetch<{ suites: Suite[] }>('/tests').then((r) => setSuites(r.suites));
  }, []);

  const closeStream = useCallback(() => {
    sourceRef.current?.close();
    sourceRef.current = null;
  }, []);

  useEffect(() => () => closeStream(), [closeStream]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function applyEvent(ev: TestEvent) {
    if (ev.type === 'snapshot') {
      setRun(ev.run);
      setResults(new Map(ev.results.map((r) => [r.id, r])));
    } else if (ev.type === 'status') {
      setRun((prev) =>
        prev
          ? {
              ...prev,
              status: ev.status,
              ghRunId: ev.ghRunId ?? prev.ghRunId,
              ghRunUrl: ev.ghRunUrl ?? prev.ghRunUrl,
            }
          : prev,
      );
    } else if (ev.type === 'totals') {
      setRun((prev) => (prev ? { ...prev, totals: ev.totals } : prev));
    } else if (ev.type === 'result') {
      setResults((prev) => {
        const next = new Map(prev);
        next.set(ev.result.id, ev.result);
        return next;
      });
    } else if (ev.type === 'finished') {
      setRun(ev.run);
      closeStream();
    }
  }

  function openStream(runId: string) {
    closeStream();
    if (!token) return;
    const url = `${API_BASE}/tests/runs/${runId}/events?access_token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);
    sourceRef.current = es;

    const onEvent = (e: MessageEvent) => {
      try {
        applyEvent(JSON.parse(e.data) as TestEvent);
      } catch {
        // ignore malformed frame
      }
    };
    for (const t of ['snapshot', 'status', 'totals', 'result', 'finished']) {
      es.addEventListener(t, onEvent);
    }
    es.onerror = () => {
      // Browser will auto-retry; nothing to do here.
    };
  }

  async function dispatch() {
    setDispatching(true);
    setConfirming(false);
    setError(null);
    setResults(new Map());
    setRun(null);
    try {
      const result = await apiFetch<{ runId: string; status: TestRunStatus }>('/tests/runs', {
        method: 'POST',
        body: JSON.stringify({ suites: selected.size > 0 ? [...selected] : ['*'] }),
        confirmed: true,
      });
      setActiveRunId(result.runId);
      openStream(result.runId);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDispatching(false);
    }
  }

  async function dryRun() {
    setError(null);
    try {
      const result = await apiFetch<{ plan: unknown }>('/tests/runs?dryRun=true', {
        method: 'POST',
        body: JSON.stringify({ suites: selected.size > 0 ? [...selected] : ['*'] }),
        dryRun: true,
      });
      setRun(null);
      setResults(new Map());
      setActiveRunId(null);
      setError('Dry-run plan: ' + JSON.stringify(result.plan));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function analyse(testId: string) {
    if (!activeRunId) return;
    try {
      const r = await apiFetch<{ suggestion: AnalystSuggestion }>(
        `/tests/runs/${activeRunId}/analyze`,
        { method: 'POST', body: JSON.stringify({ testId }) },
      );
      setAnalyses((prev) => new Map(prev).set(testId, r.suggestion));
    } catch (err) {
      setAnalyses((prev) =>
        new Map(prev).set(testId, {
          hypothesis: 'Analyst unavailable: ' + (err as Error).message,
          steps: [],
          confidence: 0,
        }),
      );
    }
  }

  const grouped = useMemo(() => {
    const bySuite = new Map<string, TestResult[]>();
    for (const r of results.values()) {
      const arr = bySuite.get(r.suite) ?? [];
      arr.push(r);
      bySuite.set(r.suite, arr);
    }
    return [...bySuite.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [results]);

  const failing = useMemo(
    () => [...results.values()].filter((r) => r.outcome === 'failed'),
    [results],
  );

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-white">Tests</h1>
      <p className="text-sm text-slate-400">
        Select suites and dispatch a run via GitHub Actions. Live results stream in over SSE; click a failure for the AI analyst.
      </p>

      <div className="rounded border border-slate-800 bg-slate-900 divide-y divide-slate-800">
        {suites.map((s) => (
          <label
            key={s.id}
            className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-slate-800/50 cursor-pointer"
          >
            <input
              type="checkbox"
              checked={selected.has(s.id)}
              onChange={() => toggle(s.id)}
              className="accent-emerald-500"
            />
            <span className="font-medium text-white">{s.name}</span>
            <span className="text-slate-500 ml-auto text-xs">{s.path}</span>
          </label>
        ))}
        {suites.length === 0 && (
          <p className="px-4 py-6 text-sm text-slate-500">Loading suites…</p>
        )}
      </div>

      <div className="flex gap-2">
        <button
          disabled={dispatching}
          onClick={dryRun}
          className="rounded bg-slate-700 hover:bg-slate-600 px-3 py-1.5 text-sm text-white disabled:opacity-40"
        >
          Dry-run
        </button>
        <button
          disabled={dispatching}
          onClick={() => setConfirming(true)}
          className="rounded bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
        >
          {dispatching
            ? 'Dispatching…'
            : selected.size === 0
              ? 'Run all suites'
              : `Run ${selected.size} suite${selected.size === 1 ? '' : 's'}`}
        </button>
      </div>

      {error && (
        <div className="rounded border border-rose-800 bg-rose-950/40 px-3 py-2 text-xs text-rose-200">
          {error}
        </div>
      )}

      {run && (
        <RunSummary run={run} resultCount={results.size} failing={failing.length} />
      )}

      {grouped.length > 0 && (
        <div className="rounded border border-slate-800 bg-slate-900 divide-y divide-slate-800">
          {grouped.map(([suite, items]) => {
            const failed = items.filter((i) => i.outcome === 'failed').length;
            return (
              <div key={suite} className="px-4 py-3">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-mono text-slate-300">{suite}</span>
                  <span className="text-slate-500">({items.length})</span>
                  {failed > 0 && (
                    <span className="text-rose-400 ml-auto">{failed} failed</span>
                  )}
                </div>
                <ul className="mt-2 space-y-1">
                  {items.map((r) => (
                    <TestRow
                      key={r.id}
                      result={r}
                      expanded={expanded.has(r.id)}
                      analysis={analyses.get(r.id)}
                      onToggle={() => {
                        setExpanded((prev) => {
                          const next = new Set(prev);
                          if (next.has(r.id)) next.delete(r.id);
                          else next.add(r.id);
                          return next;
                        });
                      }}
                      onAnalyse={() => analyse(r.id)}
                    />
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        action="tests.dispatch"
        description={
          selected.size > 0
            ? `Dispatch a test run for ${selected.size} suite(s) via GitHub Actions.`
            : 'Dispatch a test run for ALL suites via GitHub Actions.'
        }
        reversibility="reversible"
        tier={1}
        onCancel={() => setConfirming(false)}
        onConfirm={() => dispatch()}
      />
    </div>
  );
}

function RunSummary(props: { run: TestRun; resultCount: number; failing: number }) {
  const { run } = props;
  const pct =
    run.totals.total > 0
      ? Math.round(((run.totals.passed + run.totals.failed) / run.totals.total) * 100)
      : 0;
  return (
    <div className="rounded border border-slate-800 bg-slate-900 p-4 space-y-2 text-sm">
      <div className="flex items-center gap-2">
        <span
          className={`inline-block w-2 h-2 rounded-full ${STATUS_COLOUR[run.status]}`}
        />
        <span className="font-medium text-white capitalize">{run.status}</span>
        {run.ghRunUrl && (
          <a
            href={run.ghRunUrl}
            target="_blank"
            rel="noreferrer"
            className="ml-2 text-xs text-blue-400 hover:underline"
          >
            View on GitHub ↗
          </a>
        )}
        <span className="ml-auto text-xs text-slate-500">{run.id.slice(0, 8)}</span>
      </div>
      <div className="grid grid-cols-4 gap-3 text-xs">
        <Stat label="Total"   value={run.totals.total} />
        <Stat label="Passed"  value={run.totals.passed}  tone="emerald" />
        <Stat label="Failed"  value={run.totals.failed}  tone="rose" />
        <Stat label="Skipped" value={run.totals.skipped} tone="slate" />
      </div>
      {run.totals.total > 0 && (
        <div className="h-1.5 rounded bg-slate-800 overflow-hidden">
          <div
            className="h-full bg-emerald-500 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

function Stat(props: { label: string; value: number; tone?: 'emerald' | 'rose' | 'slate' }) {
  const cls =
    props.tone === 'emerald'
      ? 'text-emerald-400'
      : props.tone === 'rose'
        ? 'text-rose-400'
        : props.tone === 'slate'
          ? 'text-slate-400'
          : 'text-white';
  return (
    <div>
      <div className="text-slate-500 uppercase tracking-wide">{props.label}</div>
      <div className={`text-base font-semibold ${cls}`}>{props.value}</div>
    </div>
  );
}

function TestRow(props: {
  result: TestResult;
  expanded: boolean;
  analysis: AnalystSuggestion | undefined;
  onToggle: () => void;
  onAnalyse: () => void;
}) {
  const { result: r, expanded, analysis } = props;
  const dot =
    r.outcome === 'passed'
      ? 'bg-emerald-500'
      : r.outcome === 'failed'
        ? 'bg-rose-500'
        : r.outcome === 'skipped'
          ? 'bg-slate-500'
          : 'bg-amber-500';
  const isFail = r.outcome === 'failed';
  return (
    <li>
      <button
        onClick={isFail ? props.onToggle : undefined}
        className={`w-full flex items-center gap-2 text-xs ${isFail ? 'cursor-pointer hover:bg-slate-800/40' : 'cursor-default'} px-1 py-0.5 rounded`}
      >
        <span className={`inline-block w-1.5 h-1.5 rounded-full ${dot}`} />
        <span className={isFail ? 'text-rose-300' : 'text-slate-300'}>{r.name}</span>
        <span className="ml-auto text-slate-500">{r.durationMs}ms</span>
      </button>
      {expanded && isFail && r.failure && (
        <div className="ml-3 mt-1 rounded bg-black/40 border border-rose-900/50 p-2 space-y-2">
          <pre className="text-[11px] text-rose-200 whitespace-pre-wrap break-words">
            {r.failure.message}
          </pre>
          {r.failure.diff && (
            <pre className="text-[11px] text-amber-200 whitespace-pre-wrap break-words">
              {r.failure.diff}
            </pre>
          )}
          {r.failure.file && (
            <p className="text-[11px] text-slate-400 font-mono">
              {r.failure.file}{r.failure.line ? `:${r.failure.line}` : ''}
            </p>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={props.onAnalyse}
              className="rounded bg-violet-700 hover:bg-violet-600 text-[11px] text-white px-2 py-1"
            >
              Ask AI analyst
            </button>
            {analysis && (
              <span
                className={`text-[11px] ${
                  analysis.confidence < 0.4 ? 'text-amber-300' : 'text-violet-300'
                }`}
              >
                confidence {Math.round(analysis.confidence * 100)}%
              </span>
            )}
          </div>
          {analysis && (
            <div className="rounded bg-violet-950/30 border border-violet-900/50 p-2 space-y-1">
              <p className="text-[12px] text-violet-100">{analysis.hypothesis}</p>
              {analysis.steps.length > 0 && (
                <ul className="list-disc list-inside text-[11px] text-violet-200 space-y-0.5">
                  {analysis.steps.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

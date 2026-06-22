/**
 * Phase D.2 — AI chat tab.
 *
 * Streaming SSE consumer for `POST /ai/chat` plus structured
 * `POST /ai/proposals` for diff-based code edits.
 *
 * The right-hand panel auto-pulls the active CodeTab file (via
 * `useActiveFile`) so chats and proposals run against whatever the user is
 * editing. Approving a proposal calls `useActiveFile.edit(after)` which marks
 * the file dirty, after which the user commits via CodeTab's commit panel.
 */
import * as Dialog from '@radix-ui/react-dialog';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type {
  AIChatEvent,
  AIChatMode,
  AIModelStrategy,
  AIChatTurn,
  AIProposal,
} from '@latimer-woods-tech/studio-core';
import type { ActiveFileState } from '../../stores/activeFile.js';
import { useActiveFile } from '../../stores/activeFile.js';
import { useSession } from '../../stores/session.js';
import { apiFetch, getApiUrl } from '../../lib/api.js';

const MODES: ReadonlyArray<{ id: AIChatMode; label: string; hint: string }> = [
  { id: 'generate', label: 'Generate', hint: 'New Worker code' },
  { id: 'explain', label: 'Explain', hint: 'Walk through code' },
  { id: 'refactor', label: 'Refactor', hint: 'Improve existing code' },
];

const STRATEGIES: ReadonlyArray<{ id: AIModelStrategy; label: string; hint: string }> = [
  { id: 'execution', label: 'Execution', hint: 'Claude-oriented deterministic implementation' },
  { id: 'planning', label: 'Planning', hint: 'Gemini-oriented planning/scoping synthesis' },
  { id: 'drafting', label: 'Drafting', hint: 'Grok-oriented fast first-pass drafting' },
];

function turn(role: 'user' | 'assistant', content: string): AIChatTurn {
  return { role, content, at: new Date().toISOString() };
}

interface ScrollMetrics {
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
}

export function isNearBottom(metrics: ScrollMetrics, thresholdPx = 64): boolean {
  return metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight <= thresholdPx;
}

export function getLiveRegionFlushDelayMs(
  lastFlushAt: number,
  now: number,
  minIntervalMs = 1000,
): number {
  const elapsed = Math.max(0, now - lastFlushAt);
  return Math.max(0, minIntervalMs - elapsed);
}

function useStickyBottom(appendSignal: number, thresholdPx = 64) {
  const logRef = useRef<HTMLDivElement | null>(null);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);

  useEffect(() => {
    const node = logRef.current;
    if (!node) return;

    const sync = () => {
      setShowJumpToLatest(!isNearBottom(node, thresholdPx));
    };
    sync();

    node.addEventListener('scroll', sync, { passive: true });
    return () => node.removeEventListener('scroll', sync);
  }, [thresholdPx]);

  useEffect(() => {
    const node = logRef.current;
    if (!node) return;

    if (isNearBottom(node, thresholdPx)) {
      node.scrollTop = node.scrollHeight;
      setShowJumpToLatest(false);
      return;
    }

    setShowJumpToLatest(true);
  }, [appendSignal, thresholdPx]);

  const jumpToLatest = useCallback(() => {
    const node = logRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
    setShowJumpToLatest(false);
  }, []);

  return { logRef, showJumpToLatest, jumpToLatest };
}

export function AiTab() {
  const active = useActiveFile();
  const [history, setHistory] = useState<AIChatTurn[]>([]);
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState<AIChatMode>('generate');
  const [modelStrategy, setModelStrategy] = useState<AIModelStrategy>('execution');
  const [streaming, setStreaming] = useState(false);
  const [partial, setPartial] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [streamStatus, setStreamStatus] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  // Proposal state.
  const [proposalBusy, setProposalBusy] = useState(false);
  const [proposal, setProposal] = useState<AIProposal | null>(null);
  const [proposalError, setProposalError] = useState<string | null>(null);
  // Change-detection signal for sticky-bottom behavior when new chat content appears.
  const appendSignal = history.length + (partial ? 1 : 0) + (error ? 1 : 0);
  const { logRef, showJumpToLatest, jumpToLatest } = useStickyBottom(appendSignal);

  async function send() {
    if (!prompt.trim() || streaming) return;
    const userTurn = turn('user', prompt.trim());
    const nextHistory: AIChatTurn[] = [...history, userTurn];
    setHistory(nextHistory);
    setPrompt('');
    setPartial('');
    setError(null);
    setStreamStatus('Streaming…');
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    const { token } = useSession.getState();
    const body = {
      mode,
      modelStrategy,
      history: nextHistory,
      prompt: userTurn.content,
      context: active.path
        ? {
            path: active.path,
            // Truncate generously here; server caps at 8 KB.
            snippet: active.draftText.slice(0, 8000),
          }
        : undefined,
    };

    try {
      const res = await fetch(getApiUrl('/ai/chat'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'X-Request-Id': crypto.randomUUID(),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`Stream failed: HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let assistantText = '';
      let flushTimer: ReturnType<typeof setTimeout> | null = null;
      let lastFlushAt = 0;

      const flushPartial = () => {
        setPartial(assistantText);
        lastFlushAt = Date.now();
        flushTimer = null;
      };

      const schedulePartialFlush = () => {
        if (flushTimer !== null) return;
        flushTimer = setTimeout(
          flushPartial,
          getLiveRegionFlushDelayMs(lastFlushAt, Date.now()),
        );
      };

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const frames = buf.split('\n\n');
        buf = frames.pop() ?? '';

        for (const frame of frames) {
          const dataLine = frame.split('\n').find((l) => l.startsWith('data:'));
          if (!dataLine) continue;
          const json = dataLine.slice(5).trim();
          if (!json) continue;
          let evt: AIChatEvent;
          try {
            evt = JSON.parse(json) as AIChatEvent;
          } catch {
            continue;
          }
          if (evt.type === 'token') {
            assistantText += evt.delta;
            schedulePartialFlush();
          } else if (evt.type === 'error') {
            setError(evt.message);
          }
        }
      }

      if (flushTimer !== null) {
        clearTimeout(flushTimer);
      }
      setPartial(assistantText);

      if (assistantText) {
        const assistantTurn = turn('assistant', assistantText);
        setHistory((h) => [...h, assistantTurn]);
      }
      setPartial('');
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError((err as Error).message);
      }
    } finally {
      setStreaming(false);
      setStreamStatus('Done');
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  function reset() {
    setHistory([]);
    setPartial('');
    setError(null);
    setStreamStatus('');
  }

  async function requestProposal() {
    if (!active.path || !prompt.trim() || proposalBusy) {
      setProposalError(
        !active.path
          ? 'Open a file in the Code tab first'
          : 'Type an instruction in the prompt box',
      );
      return;
    }
    setProposalBusy(true);
    setProposalError(null);
    setProposal(null);
    try {
      const r = await apiFetch<{ proposal: AIProposal }>('/ai/proposals', {
        method: 'POST',
        body: JSON.stringify({
          path: active.path,
          modelStrategy,
          before: active.draftText,
          instruction: prompt.trim(),
          language: active.language,
        }),
      });
      setProposal(r.proposal);
    } catch (err) {
      setProposalError((err as Error).message);
    } finally {
      setProposalBusy(false);
    }
  }

  function applyProposal() {
    if (!proposal) return;
    active.edit(proposal.after);
    setProposal(null);
    setPrompt('');
  }

  return (
    <div className="flex min-h-[100dvh] flex-col gap-4 lg:flex-row">
      <section className="flex min-h-0 flex-1 flex-col rounded border border-slate-800 bg-slate-900 min-w-0">
        <header className="border-b border-slate-800 px-3 py-2 flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1">
            {MODES.map((m) => (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                title={m.hint}
                className={`target-min text-xs rounded border ${
                  mode === m.id
                    ? 'bg-emerald-700 border-emerald-600 text-white'
                    : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {STRATEGIES.map((s) => (
              <button
                key={s.id}
                onClick={() => setModelStrategy(s.id)}
                title={s.hint}
                className={`target-min text-xs rounded border ${
                  modelStrategy === s.id
                    ? 'bg-indigo-700 border-indigo-600 text-white'
                    : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="ml-auto flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
            <Dialog.Root>
              <Dialog.Trigger asChild>
                <button
                  className="lg:hidden text-xs px-2 py-1 rounded border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  Active file
                </button>
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 lg:hidden" />
                <Dialog.Content className="fixed right-0 top-0 z-50 h-[100dvh] w-[min(85vw,24rem)] overflow-auto border-l border-slate-800 bg-slate-900 p-3 lg:hidden">
                  <div className="mb-3 flex items-center justify-between">
                    <Dialog.Title className="text-xs uppercase tracking-wide text-slate-500">Active file</Dialog.Title>
                    <Dialog.Close asChild>
                      <button className="text-xs px-2 py-1 rounded border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700">
                        Close
                      </button>
                    </Dialog.Close>
                  </div>
                  <Dialog.Description className="sr-only">
                    View active file details and proposal actions.
                  </Dialog.Description>
                  <ActiveFilePanel
                    active={active}
                    proposal={proposal}
                    proposalBusy={proposalBusy}
                    proposalError={proposalError}
                    onApplyProposal={applyProposal}
                    onRejectProposal={() => setProposal(null)}
                    showHeading={false}
                  />
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
            <button
              onClick={reset}
              disabled={streaming || history.length === 0}
              className="target-min text-xs rounded border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40"
            >
              Clear
            </button>
            {streaming && (
              <button
                onClick={stop}
                className="target-primary text-xs rounded border border-rose-700 bg-rose-900/40 text-rose-200 hover:bg-rose-900/60"
              >
                Stop
              </button>
            )}
          </div>
        </header>

        <p role="status" aria-live="polite" className="sr-only">{streamStatus}</p>
        <div className="relative flex-1 min-h-0">
          <div
            ref={logRef}
            role="log"
            aria-live="polite"
            aria-relevant="additions"
            data-testid="ai-chat-log"
            className="h-full overflow-auto p-3 space-y-3 text-sm"
          >
            {history.length === 0 && !partial && (
              <p className="text-slate-500">
                Choose a strategy, then ask AI to generate, explain, or refactor Factory code.
                The system prompt enforces Workers/Hono/Drizzle/Web-Crypto standing orders.
              </p>
            )}
            {history.map((t, i) => (
              <Bubble key={i} role={t.role}>{t.content}</Bubble>
            ))}
            {partial && (
              <Bubble role="assistant" streaming>
                {partial}
              </Bubble>
            )}
            {error && <p className="text-rose-400 text-xs">⚠ {error}</p>}
            <div data-testid="ai-chat-log-end" />
          </div>
          {showJumpToLatest && (
            <button
              onClick={jumpToLatest}
              aria-label="Jump to latest message"
              className="absolute right-3 bottom-3 min-h-11 min-w-11 rounded-full border border-emerald-600 bg-emerald-700/95 px-3 text-xs font-medium text-white hover:bg-emerald-600"
            >
              ↓ Jump to latest
            </button>
          )}
        </div>

        <footer className="border-t border-slate-800 p-2">
          <textarea
            data-testid="ai-composer"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void send();
              }
            }}
            disabled={streaming}
            placeholder="Ask… (Cmd/Ctrl+Enter to send chat; click Propose for a diff)"
            rows={3}
            className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-base md:text-sm font-mono text-slate-100 resize-none disabled:opacity-50"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              onClick={() => void requestProposal()}
              disabled={proposalBusy || streaming || !prompt.trim() || !active.path}
              title={!active.path ? 'Open a file in the Code tab first' : 'Generate a code diff'}
              className="target-primary text-xs rounded bg-indigo-700 hover:bg-indigo-600 text-white disabled:opacity-40"
            >
              {proposalBusy ? 'Proposing…' : 'Propose diff'}
            </button>
            <button
              onClick={() => void send()}
              data-testid="ai-send"
              disabled={streaming || !prompt.trim()}
              className="target-primary text-xs rounded bg-emerald-700 hover:bg-emerald-600 text-white disabled:opacity-40"
            >
              {streaming ? 'Streaming…' : 'Send'}
            </button>
          </div>
        </footer>
      </section>

      <aside className="hidden w-96 shrink-0 lg:flex flex-col rounded border border-slate-800 bg-slate-900 p-3 gap-3 overflow-auto">
        <ActiveFilePanel
          active={active}
          proposal={proposal}
          proposalBusy={proposalBusy}
          proposalError={proposalError}
          onApplyProposal={applyProposal}
          onRejectProposal={() => setProposal(null)}
        />
      </aside>
    </div>
  );
}

function ActiveFilePanel(props: {
  active: ActiveFileState;
  proposal: AIProposal | null;
  proposalBusy: boolean;
  proposalError: string | null;
  onApplyProposal: () => void;
  onRejectProposal: () => void;
  showHeading?: boolean;
}) {
  const {
    active,
    proposal,
    proposalBusy,
    proposalError,
    onApplyProposal,
    onRejectProposal,
    showHeading = true,
  } = props;
  return (
    <>
      {showHeading && <h3 className="text-xs uppercase tracking-wide text-slate-500">Active file</h3>}
      {active.path ? (
        <div className="text-xs space-y-1">
          <p className="font-mono text-slate-200 break-all">{active.path}</p>
          <p className="text-slate-500">
            {active.branch} · {active.language} · {active.draftText.length} chars
            {active.dirty && <span className="text-amber-400"> · dirty</span>}
          </p>
        </div>
      ) : (
        <p className="text-slate-500 text-xs">No file open. Pick one in the Code tab.</p>
      )}

      <div className="border-t border-slate-800 pt-3">
        <h3 className="text-xs uppercase tracking-wide text-slate-500 mb-2">Proposal</h3>
        {proposalError && <p className="text-rose-400 text-xs mb-2">⚠ {proposalError}</p>}
        {!proposal && !proposalBusy && (
          <p className="text-slate-500 text-xs">
            Type an instruction in the chat box and click <span className="text-indigo-300">Propose diff</span>
            {' '}to get a structured rewrite of the active file.
          </p>
        )}
        {proposalBusy && <p className="text-slate-500 text-xs">Generating proposal…</p>}
        {proposal && (
          <div className="space-y-2">
            <p className="text-[11px] text-slate-300 italic whitespace-pre-wrap">
              {proposal.rationale}
            </p>
            <DiffView before={proposal.before} after={proposal.after} />
            <div className="flex gap-2">
              <button
                onClick={onApplyProposal}
                className="text-xs px-3 py-1.5 rounded bg-emerald-700 hover:bg-emerald-600 text-white"
              >
                Apply (marks dirty)
              </button>
              <button
                onClick={onRejectProposal}
                className="text-xs px-3 py-1.5 rounded bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-200"
              >
                Reject
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function Bubble(props: { role: 'user' | 'assistant'; streaming?: boolean; children: ReactNode }) {
  const isUser = props.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        data-chat-role={props.role}
        className={`max-w-[80%] rounded px-3 py-2 whitespace-pre-wrap font-mono text-[12px] leading-snug ${
          isUser
            ? 'bg-emerald-900/40 border border-emerald-800 text-emerald-100'
            : 'bg-slate-800 border border-slate-700 text-slate-100'
        }`}
      >
        {props.children}
        {props.streaming && <span className="inline-block w-2 h-3 bg-emerald-400 ml-0.5 animate-pulse" />}
      </div>
    </div>
  );
}

/**
 * Lightweight line-level diff viewer. Computes a longest-common-subsequence
 * between before/after and renders +/- gutter markers. Not a full Myers diff
 * but adequate for review-then-apply UX.
 */
function DiffView(props: { before: string; after: string }) {
  const beforeLines = props.before.split('\n');
  const afterLines = props.after.split('\n');
  const ops = lineDiff(beforeLines, afterLines);
  return (
    <pre className="text-[11px] font-mono leading-snug border border-slate-800 rounded bg-slate-950 max-h-[40vh] overflow-auto">
      {ops.map((op, i) => (
        <div
          key={i}
          className={
            op.kind === 'add'
              ? 'bg-emerald-900/30 text-emerald-200'
              : op.kind === 'del'
                ? 'bg-rose-900/30 text-rose-200'
                : 'text-slate-400'
          }
        >
          <span className="select-none px-1 text-slate-500">
            {op.kind === 'add' ? '+' : op.kind === 'del' ? '-' : ' '}
          </span>
          {op.text || ' '}
        </div>
      ))}
    </pre>
  );
}

interface DiffOp { kind: 'add' | 'del' | 'eq'; text: string }

function lineDiff(a: readonly string[], b: readonly string[]): DiffOp[] {
  const m = a.length;
  const n = b.length;
  // LCS DP table — bounded by file size; proposals capped at 16 KB so this is tiny.
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i -= 1) {
    for (let j = n - 1; j >= 0; j -= 1) {
      if (a[i] === b[j]) {
        dp[i]![j] = (dp[i + 1]![j + 1] ?? 0) + 1;
      } else {
        dp[i]![j] = Math.max(dp[i + 1]![j] ?? 0, dp[i]![j + 1] ?? 0);
      }
    }
  }
  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      ops.push({ kind: 'eq', text: a[i]! });
      i += 1;
      j += 1;
    } else if ((dp[i + 1]![j] ?? 0) >= (dp[i]![j + 1] ?? 0)) {
      ops.push({ kind: 'del', text: a[i]! });
      i += 1;
    } else {
      ops.push({ kind: 'add', text: b[j]! });
      j += 1;
    }
  }
  while (i < m) ops.push({ kind: 'del', text: a[i++]! });
  while (j < n) ops.push({ kind: 'add', text: b[j++]! });
  return ops;
}

/**
 * Phase D.2 — Code tab with Monaco editor + commit panel.
 *
 * Reads/writes drift through `useActiveFile` so AiTab can pick up the same
 * file context. Writes to protected branches (e.g. `main`) are blocked
 * client-side AND server-side; users must commit to a feature branch and
 * open a PR.
 */
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import type {
  RepoBranch,
  RepoCommitResponse,
  RepoFileContent,
  RepoTreeNode,
} from '@latimer-woods-tech/studio-core';
import { apiFetch } from '../../lib/api.js';
import { useActiveFile, guessLanguage } from '../../stores/activeFile.js';
import { Button } from '../../components/ui/button.js';
import { Sheet, SheetContent, SheetTrigger } from '../../components/ui/sheet.js';

const MonacoEditor = lazy(() =>
  import('@monaco-editor/react').then((m) => ({ default: m.default })),
);

interface TreeFolder {
  name: string;
  path: string;
  children: Map<string, TreeFolder>;
  files: RepoTreeNode[];
}

function buildTree(nodes: readonly RepoTreeNode[]): TreeFolder {
  const root: TreeFolder = { name: '', path: '', children: new Map(), files: [] };
  for (const n of nodes) {
    const parts = n.path.split('/');
    let cur = root;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const seg = parts[i]!;
      let next = cur.children.get(seg);
      if (!next) {
        next = {
          name: seg,
          path: parts.slice(0, i + 1).join('/'),
          children: new Map(),
          files: [],
        };
        cur.children.set(seg, next);
      }
      cur = next;
    }
    if (n.type === 'blob') cur.files.push(n);
  }
  return root;
}

export function CodeTab() {
  const active = useActiveFile();
  const [branches, setBranches] = useState<RepoBranch[]>([]);
  const [branchesTick, setBranchesTick] = useState(0);
  const [ref, setRef] = useState<string>('main');
  const [tree, setTree] = useState<RepoTreeNode[]>([]);
  const [treeOpen, setTreeOpen] = useState(false);
  const [treeLoading, setTreeLoading] = useState(false);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileMeta, setFileMeta] = useState<RepoFileContent | null>(null);

  useEffect(() => {
    apiFetch<{ branches: RepoBranch[] }>('/repo/branches')
      .then((r) => setBranches(r.branches))
      .catch((err) => setTreeError((err as Error).message));
  }, [branchesTick]);

  useEffect(() => {
    let cancelled = false;
    setTreeLoading(true);
    setTreeError(null);
    apiFetch<{ nodes: RepoTreeNode[]; truncated: boolean }>(
      `/repo/tree?ref=${encodeURIComponent(ref)}`,
    )
      .then((r) => !cancelled && setTree(r.nodes))
      .catch((err) => !cancelled && setTreeError((err as Error).message))
      .finally(() => !cancelled && setTreeLoading(false));
    return () => {
      cancelled = true;
    };
  }, [ref]);

  async function openFile(path: string) {
    if (active.dirty && !confirm('Discard unsaved changes?')) return;
    setFileLoading(true);
    setFileMeta(null);
    try {
      const r = await apiFetch<{ file: RepoFileContent }>(
        `/repo/file?path=${encodeURIComponent(path)}&ref=${encodeURIComponent(ref)}`,
      );
      setFileMeta(r.file);
      if (!r.file.binary && r.file.text !== undefined) {
        active.open({
          path: r.file.path,
          branch: ref,
          language: guessLanguage(r.file.path),
          baseSha: r.file.sha,
          text: r.file.text,
        });
        setTreeOpen(false);
      }
    } catch (err) {
      setFileMeta({
        path,
        ref,
        sha: '',
        binary: true,
        size: 0,
        text: `Error: ${(err as Error).message}`,
      });
    } finally {
      setFileLoading(false);
    }
  }

  const root = useMemo(() => buildTree(tree), [tree]);

  return (
    <div className="flex h-[calc(100vh-92px)] gap-4">
      <section className="flex min-w-0 flex-1 flex-col rounded-md border border-border bg-background">
        <header className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2 text-xs text-muted-foreground">
          <Sheet open={treeOpen} onOpenChange={setTreeOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm">Browse files</Button>
            </SheetTrigger>
            <SheetContent side="left" className="flex w-[min(95vw,28rem)] flex-col p-0">
              <div className="border-b border-border p-3">
                <label className="text-[11px] uppercase tracking-wide text-muted-foreground">View branch</label>
                <select
                  value={ref}
                  onChange={(e) => setRef(e.target.value)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs text-foreground"
                >
                  {branches.length === 0 && <option value="main">main</option>}
                  {branches.map((b) => (
                    <option key={b.name} value={b.name}>
                      {b.name}{b.isDefault ? ' (default)' : ''}{b.protected ? ' 🔒' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1 overflow-auto p-2 text-xs text-muted-foreground">
                {treeLoading && <p className="text-muted-foreground">Loading tree…</p>}
                {treeError && <p className="text-destructive">{treeError}</p>}
                {!treeLoading && !treeError && (
                  <FolderNode folder={root} depth={0} onPick={openFile} active={active.path} initialOpen />
                )}
              </div>
            </SheetContent>
          </Sheet>
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Branch:</span>
          <select
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1.5 text-xs text-foreground"
          >
            {branches.length === 0 && <option value="main">main</option>}
            {branches.map((b) => (
              <option key={b.name} value={b.name}>
                {b.name}{b.isDefault ? ' (default)' : ''}{b.protected ? ' 🔒' : ''}
              </option>
            ))}
          </select>
          {active.path && <span className="ml-auto truncate font-mono text-foreground">{active.path}</span>}
        </header>

        <header className="flex items-center gap-2 border-b border-border px-3 py-2 text-xs text-muted-foreground">
          {active.path ? (
            <>
              <span className="font-mono text-foreground truncate">{active.path}</span>
              {active.dirty && (
                <span className="text-amber-400 text-[10px] uppercase">● dirty</span>
              )}
              <span className="ml-auto text-muted-foreground">{active.draftText.length} chars</span>
            </>
          ) : fileMeta?.binary ? (
            <span className="font-mono text-foreground">{fileMeta.path} — binary file</span>
          ) : (
            <span>Select a file to edit.</span>
          )}
        </header>

        <div className="flex-1 min-h-0">
          {fileLoading && <p className="p-4 text-sm text-muted-foreground">Loading…</p>}
          {fileMeta?.binary && (
            <p className="p-4 text-sm text-muted-foreground">
              Binary or oversized file — preview disabled.
            </p>
          )}
          {active.path && !fileMeta?.binary && (
            <Suspense fallback={<p className="p-4 text-sm text-muted-foreground">Loading editor…</p>}>
              <MonacoEditor
                height="100%"
                language={active.language}
                value={active.draftText}
                theme="vs-dark"
                onChange={(v) => active.edit(v ?? '')}
                options={{
                  fontSize: 12,
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  tabSize: 2,
                }}
              />
            </Suspense>
          )}
        </div>
        {active.path && !fileMeta?.binary && (
          <CommitPanel
            branches={branches}
            onBranchCreated={() => setBranchesTick((t) => t + 1)}
          />
        )}
      </section>
    </div>
  );
}

function CommitPanel(props: {
  branches: RepoBranch[];
  onBranchCreated: () => void;
}) {
  const active = useActiveFile();
  const writableBranches = props.branches.filter((b) => !b.isDefault && !b.protected);
  const [commitBranch, setCommitBranch] = useState<string>('');
  const [newBranchName, setNewBranchName] = useState<string>('');
  const [creatingBranch, setCreatingBranch] = useState(false);
  const [message, setMessage] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Default commit-target to first writable branch.
  useEffect(() => {
    if (!commitBranch && writableBranches.length > 0) {
      setCommitBranch(writableBranches[0]!.name);
    }
  }, [writableBranches, commitBranch]);

  async function commit() {
    if (!active.path || busy) return;
    if (!commitBranch) {
      setError('Pick or create a branch first');
      return;
    }
    if (!message.trim()) {
      setError('Commit message required');
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const r = await apiFetch<RepoCommitResponse>('/repo/commit', {
        method: 'POST',
        body: JSON.stringify({
          branch: commitBranch,
          path: active.path,
          content: active.draftText,
          baseSha: commitBranch === active.branch ? active.baseSha ?? undefined : undefined,
          message: message.trim(),
        }),
      });
      active.saved(r.blobSha, active.draftText);
      setSuccess(`Committed ${r.commitSha.slice(0, 7)} → ${r.branch}`);
      setMessage('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function createBranch() {
    if (!newBranchName.trim() || creatingBranch) return;
    setCreatingBranch(true);
    setError(null);
    try {
      await apiFetch<{ branch: { name: string; sha: string } }>('/repo/branches', {
        method: 'POST',
        body: JSON.stringify({ name: newBranchName.trim(), from: 'main' }),
      });
      const created = newBranchName.trim();
      setNewBranchName('');
      setSuccess(`Branch ${created} created`);
      props.onBranchCreated();
      setCommitBranch(created);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreatingBranch(false);
    }
  }

  async function openPR() {
    if (!commitBranch) return;
    setBusy(true);
    setError(null);
    try {
      const r = await apiFetch<{ pr: { number: number; url: string } }>('/repo/pull-requests', {
        method: 'POST',
        body: JSON.stringify({
          head: commitBranch,
          base: 'main',
          title: message.trim() || `Studio: changes from ${commitBranch}`,
        }),
      });
      setSuccess(`PR #${r.pr.number} opened — ${r.pr.url}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-t border-slate-800 p-3 space-y-2 text-xs">
      <div className="flex gap-2 items-center flex-wrap">
        <label className="text-slate-500 uppercase text-[10px]">Commit to</label>
        <select
          value={commitBranch}
          onChange={(e) => setCommitBranch(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-100"
        >
          {writableBranches.length === 0 && <option value="">(no writable branches)</option>}
          {writableBranches.map((b) => (
            <option key={b.name} value={b.name}>{b.name}</option>
          ))}
        </select>
        <span className="text-slate-600">or</span>
        <input
          value={newBranchName}
          onChange={(e) => setNewBranchName(e.target.value)}
          placeholder="new-branch-name"
          className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-100 w-48"
        />
        <button
          onClick={() => void createBranch()}
          disabled={!newBranchName.trim() || creatingBranch}
          className="text-[11px] px-2 py-1 rounded bg-slate-800 border border-slate-700 hover:bg-slate-700 disabled:opacity-40"
        >
          {creatingBranch ? '…' : 'Create branch'}
        </button>
      </div>
      <input
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Commit message"
        className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-slate-100"
      />
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => void commit()}
          disabled={busy || !active.dirty || !commitBranch}
          className="text-xs px-3 py-1.5 rounded bg-emerald-700 hover:bg-emerald-600 text-white disabled:opacity-40"
        >
          {busy ? 'Committing…' : 'Commit'}
        </button>
        <button
          onClick={() => void openPR()}
          disabled={busy || !commitBranch}
          className="text-xs px-3 py-1.5 rounded bg-slate-800 border border-slate-700 hover:bg-slate-700 disabled:opacity-40"
        >
          Open PR → main
        </button>
        {error && <span className="text-rose-400 self-center ml-2">{error}</span>}
        {success && <span className="text-emerald-400 self-center ml-2">{success}</span>}
      </div>
    </div>
  );
}

function FolderNode(props: {
  folder: TreeFolder;
  depth: number;
  onPick: (path: string) => void;
  active: string | null;
  initialOpen?: boolean;
}) {
  const { folder, depth, onPick, active } = props;
  const [open, setOpen] = useState<boolean>(Boolean(props.initialOpen));
  const childFolders = [...folder.children.values()].sort((a, b) => a.name.localeCompare(b.name));
  const files = [...folder.files].sort((a, b) => a.path.localeCompare(b.path));

  if (depth === 0) {
    return (
      <div>
        {childFolders.map((c) => (
          <FolderNode key={c.path} folder={c} depth={1} onPick={onPick} active={active} />
        ))}
        {files.map((f) => (
          <FileLink key={f.path} node={f} depth={1} onPick={onPick} active={active} />
        ))}
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 w-full text-left hover:bg-slate-800/50 px-1 rounded"
        style={{ paddingLeft: `${depth * 8}px` }}
      >
        <span className="text-slate-500 w-3">{open ? '▾' : '▸'}</span>
        <span className="text-slate-300">{folder.name}</span>
      </button>
      {open && (
        <>
          {childFolders.map((c) => (
            <FolderNode key={c.path} folder={c} depth={depth + 1} onPick={onPick} active={active} />
          ))}
          {files.map((f) => (
            <FileLink key={f.path} node={f} depth={depth + 1} onPick={onPick} active={active} />
          ))}
        </>
      )}
    </div>
  );
}

function FileLink(props: {
  node: RepoTreeNode;
  depth: number;
  onPick: (path: string) => void;
  active: string | null;
}) {
  const { node, depth, onPick, active } = props;
  const name = node.path.split('/').pop() ?? node.path;
  const isActive = active === node.path;
  return (
    <button
      onClick={() => onPick(node.path)}
      className={`flex items-center gap-1 w-full text-left px-1 rounded ${
        isActive
          ? 'bg-emerald-900/40 text-emerald-200'
          : 'text-slate-400 hover:bg-slate-800/40 hover:text-slate-200'
      }`}
      style={{ paddingLeft: `${depth * 8 + 12}px` }}
    >
      <span>{name}</span>
    </button>
  );
}

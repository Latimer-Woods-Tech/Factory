import { describe, it, expect } from 'vitest';
import type {
  AIChatEvent,
  AIModelStrategy,
  AIChatRequest,
  AIChatTurn,
  AIProposal,
  AIProposalRequest,
  RepoBranch,
  RepoCommitRequest,
  RepoCreateBranchRequest,
  RepoFileContent,
  RepoOpenPRRequest,
  RepoTreeNode,
} from './repo.js';

describe('repo types', () => {
  it('RepoTreeNode discriminates tree vs blob', () => {
    const dir: RepoTreeNode = { path: 'apps', type: 'tree', sha: 'a', size: 0 };
    const file: RepoTreeNode = {
      path: 'apps/admin-studio/src/index.ts',
      type: 'blob',
      sha: 'b',
      size: 1234,
    };
    expect(dir.type).toBe('tree');
    expect(file.size).toBeGreaterThan(0);
  });

  it('RepoFileContent supports binary flag without text', () => {
    const bin: RepoFileContent = { path: 'logo.png', ref: 'main', sha: 'c', binary: true, size: 99 };
    const txt: RepoFileContent = { path: 'README.md', ref: 'main', sha: 'd', binary: false, size: 11, text: 'hi' };
    expect(bin.text).toBeUndefined();
    expect(txt.text).toBe('hi');
  });

  it('RepoBranch flags default + protected', () => {
    const main: RepoBranch = { name: 'main', sha: 'aaa', isDefault: true, protected: true };
    expect(main.isDefault && main.protected).toBe(true);
  });
});

describe('AI chat types', () => {
  it('AIModelStrategy supports execution/planning/drafting/workbench', () => {
    const strategies: AIModelStrategy[] = ['execution', 'planning', 'drafting', 'workbench'];
    expect(strategies).toContain('workbench');
  });

  it('AIChatRequest carries history + optional context', () => {
    const turn: AIChatTurn = { role: 'user', content: 'hi', at: new Date().toISOString() };
    const req: AIChatRequest = {
      mode: 'explain',
      modelStrategy: 'planning',
      history: [turn],
      prompt: 'what does this do?',
      context: { path: 'src/x.ts', snippet: 'export const a = 1', language: 'ts' },
    };
    expect(req.mode).toBe('explain');
    expect(req.history.length).toBe(1);
  });

  it('AIChatEvent discriminated union has token | error | done', () => {
    const tok: AIChatEvent = { type: 'token', delta: 'x' };
    const err: AIChatEvent = { type: 'error', message: 'boom' };
    const done: AIChatEvent = { type: 'done', provider: 'gemini', tokens: { input: 1, output: 2 } };
    expect(tok.type).toBe('token');
    expect(err.type).toBe('error');
    expect(done.type).toBe('done');
  });
});

describe('Phase D.2 commit + PR + proposal types', () => {
  it('RepoCommitRequest accepts new file (no baseSha) and update', () => {
    const create: RepoCommitRequest = {
      branch: 'studio/new-file',
      path: 'apps/x/README.md',
      content: '# hi',
      message: 'add readme',
    };
    const update: RepoCommitRequest = {
      branch: 'studio/edit',
      path: 'apps/x/README.md',
      content: '# hi 2',
      baseSha: 'abc123',
      message: 'tweak readme',
    };
    expect(create.baseSha).toBeUndefined();
    expect(update.baseSha).toBe('abc123');
  });

  it('RepoCreateBranchRequest defaults from to main when omitted', () => {
    const req: RepoCreateBranchRequest = { name: 'studio/foo' };
    expect(req.from).toBeUndefined();
  });

  it('RepoOpenPRRequest base defaults to main implicitly', () => {
    const req: RepoOpenPRRequest = { head: 'studio/foo', title: 'Add foo' };
    expect(req.base).toBeUndefined();
    expect(req.draft).toBeUndefined();
  });

  it('AIProposalRequest + AIProposal pair carries before/after', () => {
    const req: AIProposalRequest = {
      path: 'a.ts',
      modelStrategy: 'workbench',
      before: 'export const a = 1;\n',
      instruction: 'rename a to b',
    };
    const proposal: AIProposal = {
      path: req.path,
      before: req.before,
      after: 'export const b = 1;\n',
      rationale: 'renamed',
    };
    expect(proposal.before).toBe(req.before);
    expect(proposal.after).not.toBe(proposal.before);
  });
});

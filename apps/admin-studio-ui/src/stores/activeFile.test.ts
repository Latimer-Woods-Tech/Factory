/**
 * Tests for the activeFile store — open, edit, saved, close, dirty tracking.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { useActiveFile } from './activeFile.js';

describe('useActiveFile store', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    useActiveFile.getState().close();
  });

  it('starts with no open file', () => {
    const s = useActiveFile.getState();
    expect(s.path).toBeNull();
    expect(s.dirty).toBe(false);
    expect(s.originalText).toBe('');
    expect(s.draftText).toBe('');
  });

  it('open() sets path, branch, language, sha, and text', () => {
    useActiveFile.getState().open({
      path: 'src/index.ts',
      branch: 'main',
      language: 'typescript',
      baseSha: 'abc123',
      text: 'const x = 1;',
    });
    const s = useActiveFile.getState();
    expect(s.path).toBe('src/index.ts');
    expect(s.branch).toBe('main');
    expect(s.language).toBe('typescript');
    expect(s.baseSha).toBe('abc123');
    expect(s.originalText).toBe('const x = 1;');
    expect(s.draftText).toBe('const x = 1;');
    expect(s.dirty).toBe(false);
  });

  it('open() clears dirty state from a prior edit', () => {
    useActiveFile.getState().open({
      path: 'a.ts', branch: 'main', language: 'typescript', baseSha: null, text: 'original',
    });
    useActiveFile.getState().edit('modified');
    expect(useActiveFile.getState().dirty).toBe(true);

    // Open a new file — dirty must reset
    useActiveFile.getState().open({
      path: 'b.ts', branch: 'main', language: 'typescript', baseSha: null, text: 'fresh',
    });
    expect(useActiveFile.getState().dirty).toBe(false);
    expect(useActiveFile.getState().path).toBe('b.ts');
  });

  it('edit() marks dirty when text differs from original', () => {
    useActiveFile.getState().open({
      path: 'src/a.ts', branch: 'main', language: 'typescript', baseSha: null, text: 'hello',
    });
    useActiveFile.getState().edit('hello world');
    const s = useActiveFile.getState();
    expect(s.draftText).toBe('hello world');
    expect(s.dirty).toBe(true);
  });

  it('edit() clears dirty when text is restored to original', () => {
    useActiveFile.getState().open({
      path: 'src/a.ts', branch: 'main', language: 'typescript', baseSha: null, text: 'hello',
    });
    useActiveFile.getState().edit('modified');
    useActiveFile.getState().edit('hello'); // restore
    expect(useActiveFile.getState().dirty).toBe(false);
  });

  it('saved() updates sha and clears dirty', () => {
    useActiveFile.getState().open({
      path: 'src/a.ts', branch: 'main', language: 'typescript', baseSha: 'sha-old', text: 'v1',
    });
    useActiveFile.getState().edit('v2');
    useActiveFile.getState().saved('sha-new', 'v2');

    const s = useActiveFile.getState();
    expect(s.baseSha).toBe('sha-new');
    expect(s.originalText).toBe('v2');
    expect(s.draftText).toBe('v2');
    expect(s.dirty).toBe(false);
  });

  it('close() resets file state but preserves branch', () => {
    useActiveFile.getState().open({
      path: 'src/a.ts', branch: 'feature/x', language: 'typescript', baseSha: 'sha', text: 'text',
    });
    useActiveFile.getState().close();

    const s = useActiveFile.getState();
    expect(s.path).toBeNull();
    expect(s.baseSha).toBeNull();
    expect(s.originalText).toBe('');
    expect(s.draftText).toBe('');
    expect(s.dirty).toBe(false);
  });
});

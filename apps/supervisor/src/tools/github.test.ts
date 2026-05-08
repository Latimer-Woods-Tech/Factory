import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchApprovedIssues,
  postPlanComment,
  addLabel,
  getPlanApproval,
  formatPlanComment,
} from './github';

const FAKE_TOKEN = 'ghp_test_token';

// Helpers to build minimal GitHub API response shapes
function makeIssue(number: number, title = 'Test issue', body = 'body') {
  return { number, title, body, labels: [{ name: 'supervisor:approved-source' }] };
}

describe('fetchApprovedIssues', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns parsed issues on 200', async () => {
    const issues = [makeIssue(1), makeIssue(2)];
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(issues), { status: 200 }),
    );

    const result = await fetchApprovedIssues(FAKE_TOKEN);
    expect(result).toHaveLength(2);
    expect(result[0]?.number).toBe(1);
  });

  it('caps results at 10 even if API returns more', async () => {
    const issues = Array.from({ length: 15 }, (_, i) => makeIssue(i + 1));
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(issues), { status: 200 }),
    );

    const result = await fetchApprovedIssues(FAKE_TOKEN);
    expect(result.length).toBeLessThanOrEqual(10);
  });

  it('throws on non-200 response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('Unauthorized', { status: 401 }),
    );

    await expect(fetchApprovedIssues(FAKE_TOKEN)).rejects.toThrow(
      'fetchApprovedIssues: GitHub API error 401',
    );
  });

  it('sends Bearer token in Authorization header', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify([]), { status: 200 }),
    );

    await fetchApprovedIssues(FAKE_TOKEN);

    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['Authorization']).toBe(
      `Bearer ${FAKE_TOKEN}`,
    );
  });
});

describe('postPlanComment', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the comment id on success', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 42 }), { status: 201 }),
    );

    const id = await postPlanComment(FAKE_TOKEN, 1, '## Plan');
    expect(id).toBe(42);
  });

  it('throws on non-2xx response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('Forbidden', { status: 403 }),
    );

    await expect(postPlanComment(FAKE_TOKEN, 1, '## Plan')).rejects.toThrow(
      'postPlanComment: GitHub API error 403',
    );
  });
});

describe('addLabel', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves without error on 200', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify([{ name: 'supervisor:no-template' }]), { status: 200 }),
    );

    await expect(addLabel(FAKE_TOKEN, 1, 'supervisor:no-template')).resolves.toBeUndefined();
  });

  it('throws on failure', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('Not Found', { status: 404 }),
    );

    await expect(addLabel(FAKE_TOKEN, 999, 'bad-label')).rejects.toThrow(
      'addLabel: GitHub API error 404',
    );
  });
});

describe('getPlanApproval', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns true when a CODEOWNER +1 reaction exists', async () => {
    const reactions = [{ content: '+1', user: { login: 'adrper79-dot' } }];
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(reactions), { status: 200 }),
    );

    expect(await getPlanApproval(FAKE_TOKEN, 1, 100)).toBe(true);
  });

  it('returns false when reaction exists but not from a CODEOWNER', async () => {
    const reactions = [{ content: '+1', user: { login: 'random-user' } }];
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(reactions), { status: 200 }),
    );

    expect(await getPlanApproval(FAKE_TOKEN, 1, 100)).toBe(false);
  });

  it('returns false when no reactions', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify([]), { status: 200 }),
    );

    expect(await getPlanApproval(FAKE_TOKEN, 1, 100)).toBe(false);
  });

  it('throws on API error', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('Server Error', { status: 500 }),
    );

    await expect(getPlanApproval(FAKE_TOKEN, 1, 100)).rejects.toThrow(
      'getPlanApproval: GitHub API error 500',
    );
  });
});

describe('formatPlanComment', () => {
  it('includes template id and tier', () => {
    const md = formatPlanComment(
      'deps-bump-minor-patch',
      'Bump minor/patch dependencies',
      'green',
      [{ tool: 'github.readFile' }, { tool: 'github.mergePR' }],
    );

    expect(md).toContain('deps-bump-minor-patch');
    expect(md).toContain('green');
    expect(md).toContain('🟢');
  });

  it('includes approve instruction', () => {
    const md = formatPlanComment('some-template', '', 'yellow', []);
    expect(md).toContain('React 👍 to approve');
  });

  it('lists all step tools', () => {
    const md = formatPlanComment('t', '', 'red', [
      { tool: 'github.comment' },
      { tool: 'github.openPR' },
    ]);

    expect(md).toContain('github.comment');
    expect(md).toContain('github.openPR');
  });
});

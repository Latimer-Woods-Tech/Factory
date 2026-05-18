import { useEffect, type ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { MemoryRouter } from 'react-router-dom';
import { OverviewTab } from '../pages/tabs/OverviewTab';
import { AiTab } from '../pages/tabs/AiTab';
import { CodeTab } from '../pages/tabs/CodeTab';
import { AuditTab } from '../pages/tabs/AuditTab';
import { useSession } from '../stores/session';

const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ1c2VyXzEiLCJ1c2VyRW1haWwiOiJvcGVyYXRvckBmYWN0b3J5LmRldiIsInJvbGUiOiJhZG1pbiJ9.signature';

function mockResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function installApiMock(): () => void {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL) => {
    const raw = typeof input === 'string' ? input : input.toString();
    const url = new URL(raw, 'http://localhost');
    const path = url.pathname;

    if (path.endsWith('/api/me')) {
      return mockResponse({
        env: 'staging',
        user: { id: 'user_1', email: 'operator@factory.dev', role: 'admin' },
        sessionId: 'sess_1',
        envLockedAt: Date.now(),
      });
    }
    if (path.endsWith('/api/observability/sentry/issues')) return mockResponse({ configured: true, issues: [] });
    if (path.endsWith('/api/observability/posthog/tiles')) return mockResponse({ configured: true, tiles: [] });
    if (path.endsWith('/api/observability/telemetry-coverage')) return mockResponse({ env: 'staging', apps: [] });
    if (path.endsWith('/api/apps/health')) return mockResponse({ env: 'staging', results: [] });
    if (path.endsWith('/api/apps/versions')) return mockResponse({ env: 'staging', configured: true, results: [] });
    if (path.endsWith('/api/observability/synthetic/journey')) return mockResponse({ configured: true, outageClass: 'ok', probes: [], trend: [] });
    if (path.endsWith('/api/repo/branches')) return mockResponse({ branches: [{ name: 'main', protected: true, isDefault: true }] });
    if (path.endsWith('/api/repo/tree')) return mockResponse({ nodes: [{ path: 'src/index.ts', type: 'blob' }], truncated: false });
    if (path.endsWith('/api/repo/file')) {
      return mockResponse({ file: { path: 'src/index.ts', ref: 'main', sha: 'sha', binary: false, size: 12, text: 'export {}\n' } });
    }
    if (path.endsWith('/api/audit')) return mockResponse({ rows: [], nextCursor: null });

    return mockResponse({});
  };

  return () => {
    globalThis.fetch = originalFetch;
  };
}

function StoryHarness(props: { children: ReactNode }) {
  useEffect(() => {
    useSession.setState({
      token,
      env: 'staging',
      user: { id: 'user_1', email: 'operator@factory.dev', role: 'admin' },
      expiresAt: Date.now() + 60 * 60 * 1000,
    });
    const cleanup = installApiMock();
    return cleanup;
  }, []);

  return <MemoryRouter>{props.children}</MemoryRouter>;
}

const meta = {
  title: 'primary-tabs/Overview-AI-Code-Audit',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  render: () => (
    <StoryHarness>
      <OverviewTab />
    </StoryHarness>
  ),
  parameters: { mode: 'light' },
};

export const AI: Story = {
  render: () => (
    <StoryHarness>
      <AiTab />
    </StoryHarness>
  ),
  parameters: { mode: 'dark' },
};

export const Code: Story = {
  render: () => (
    <StoryHarness>
      <CodeTab />
    </StoryHarness>
  ),
  parameters: { mode: 'reduced-motion' },
};

export const Audit: Story = {
  render: () => (
    <StoryHarness>
      <AuditTab />
    </StoryHarness>
  ),
  parameters: { mode: 'rtl' },
};

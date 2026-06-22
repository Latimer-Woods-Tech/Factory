// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AiTab } from './tabs/AiTab.js';
import { MemoryRouter } from 'react-router-dom';
import { Dashboard } from './Dashboard.js';
import { LoginPage } from './LoginPage.js';

describe('WCAG 2.2 target-size class usage', () => {
  it('uses target-min for AI mode/strategy chips and Clear', () => {
    const html = renderToStaticMarkup(<AiTab />);
    // Mode/strategy chip buttons use target-min (≥36px tap target)
    expect(html).toContain('target-min');
  });

  it('uses target-primary for primary AI actions (Send, Propose diff)', () => {
    const html = renderToStaticMarkup(<AiTab />);
    // Primary action buttons use target-primary (≥44px tap target per WCAG 2.2 §2.5.8)
    expect(html).toContain('target-primary');
    // Verify the Send button has the class (default render shows "Send"; it
    // becomes "Streaming…" only while a stream is active — not in static markup).
    expect(html).toMatch(/target-primary[^"]*"[^>]*>Send</);
  });

  it('Dashboard mobile nav links use target-min', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/overview']}>
        <Dashboard />
      </MemoryRouter>,
    );
    expect(html).toContain('target-min');
  });

  it('LoginPage primary controls use target-primary', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );
    // The default view's primary actions are the environment-selection cards.
    // The fallback-login submit button (also target-primary) renders only after
    // an env is picked, which a static (non-interactive) render can't trigger.
    expect(html).toContain('target-primary');
  });
});

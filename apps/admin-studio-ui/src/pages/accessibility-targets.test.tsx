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
    expect(html).toMatch(/data-testid="ai-send"[^>]*class="[^"]*target-primary/);
  });

  it('Dashboard mobile nav links use target-min', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/overview']}>
        <Dashboard />
      </MemoryRouter>,
    );
    expect(html).toContain('target-min');
  });

  it('LoginPage renders explicit environment buttons before auth', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );
    expect(html).toContain('aria-label="Local');
    expect(html).toContain('aria-label="Staging');
    expect(html).toContain('aria-label="Production');
  });
});

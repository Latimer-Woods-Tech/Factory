// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { AiTab } from './tabs/AiTab.js';
import { Dashboard } from './Dashboard.js';
import { LoginPage } from './LoginPage.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('target-size class usage', () => {
  it('uses target utilities for AI chips and primary actions', () => {
    const html = renderToStaticMarkup(<AiTab />);
    expect(html.match(/target-min/g)?.length).toBe(7);
    expect(html.match(/target-primary/g)?.length).toBe(2);
  });

  it('uses larger stacked targets for mobile bottom nav tabs', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <MemoryRouter
          initialEntries={['/overview']}
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <Dashboard />
        </MemoryRouter>,
      );
    });

    const mobileNavLink = container.querySelector('nav[aria-label="Studio sections mobile"] a');
    expect(mobileNavLink?.className).toContain('min-h-12');
    expect(mobileNavLink?.className).toContain('min-w-14');
    expect(mobileNavLink?.className).toContain('flex-col');
    expect(mobileNavLink?.className).toContain('gap-1');
    expect(mobileNavLink?.textContent).toContain('Overview');

    const icon = mobileNavLink?.querySelector('[aria-hidden="true"]');
    expect(icon?.textContent).toContain('🏠');

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('uses the primary target class for login submit', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <LoginPage />
        </MemoryRouter>,
      );
    });

    const envButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Local'),
    );
    expect(envButton).toBeTruthy();

    act(() => {
      envButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const submitButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.startsWith('Sign in to local'),
    );
    expect(submitButton?.className).toContain('target-primary');

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});

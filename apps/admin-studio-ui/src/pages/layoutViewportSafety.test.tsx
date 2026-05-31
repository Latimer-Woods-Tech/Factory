// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import type { ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { Dashboard } from './Dashboard.js';

async function render(element: ReactElement): Promise<HTMLElement> {
  const container = document.createElement('div');
  const root = createRoot(container);
  root.render(element);
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
  return container;
}

describe('viewport-safe layout classes', () => {
  it('uses dynamic viewport and safe-area classes in Dashboard shell', async () => {
    const container = await render(
      <MemoryRouter initialEntries={['/overview']}>
        <Dashboard />
      </MemoryRouter>,
    );

    const shell = container.firstElementChild as HTMLElement;
    // ADM-9.2: outer shell must use dynamic viewport height (dvh) so mobile
    // browsers that resize on scroll don't clip the bottom of the UI.
    expect(shell.className).toContain('h-[100dvh]');
    // ADM-9.2: safe-area-inset-top ensures content clears notch/status bar
    // on notched devices (iPhone X+, Android gesture-nav).
    expect(shell.className).toContain('pt-safe-top');

    // ADM-9.2: main content area must carry safe-area bottom padding so content
    // is not obscured by the home indicator on notched devices.
    const main = container.querySelector('main') as HTMLElement;
    expect(main.className).toContain('pb-[calc(env(safe-area-inset-bottom)+4rem)]');
  });
});

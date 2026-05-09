// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import type { ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { Dashboard } from './Dashboard.js';
import { AiTab } from './tabs/AiTab.js';

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
    expect(shell.className).toContain('h-[calc(100dvh-44px)]');
    expect(shell.className).toContain('pt-safe-top');

    // Mobile nav is Drawer-based (shadcn/ADM-9.9); main content carries the
    // safe-area bottom padding so content is not obscured on notched devices.
    const main = container.querySelector('main') as HTMLElement;
    expect(main.className).toContain('pb-[calc(env(safe-area-inset-bottom)+4rem)]');
  });

  it('uses static viewport height in AiTab panel', async () => {
    const container = await render(<AiTab />);
    const shell = container.firstElementChild as HTMLElement;
    expect(shell.className).toContain('h-[calc(100svh-92px)]');
  });
});

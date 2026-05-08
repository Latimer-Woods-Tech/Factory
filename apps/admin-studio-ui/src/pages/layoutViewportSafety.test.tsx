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

    const main = container.querySelector('main') as HTMLElement;
    expect(main.className).toContain('pb-[calc(env(safe-area-inset-bottom)+4rem)]');

    const mobileNav = container.querySelector('nav[aria-label="Studio sections mobile"]') as HTMLElement;
    expect(mobileNav.className).toContain('pb-safe-bottom');
    expect(mobileNav.className).toContain('pl-[env(safe-area-inset-left)]');
    expect(mobileNav.className).toContain('pr-[env(safe-area-inset-right)]');
  });

  it('uses static viewport height in AiTab panel', async () => {
    const container = await render(<AiTab />);
    const shell = container.firstElementChild as HTMLElement;
    expect(shell.className).toContain('h-[calc(100svh-92px)]');
  });
});

// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { Dashboard } from './Dashboard.js';
import { AiTab } from './tabs/AiTab.js';

function render(element: ReactElement): HTMLElement {
  const container = document.createElement('div');
  container.innerHTML = renderToStaticMarkup(element);
  return container;
}

describe('viewport-safe layout classes', () => {
  it('uses dynamic viewport and safe-area classes in Dashboard shell', () => {
    const container = render(
      <MemoryRouter initialEntries={['/overview']}>
        <Dashboard />
      </MemoryRouter>,
    );

    const shell = container.firstElementChild as HTMLElement;
    expect(shell.className).toContain('h-[calc(100dvh-44px)]');

    const main = container.querySelector('main') as HTMLElement;
    expect(main.className).toContain('pb-[calc(env(safe-area-inset-bottom)+4rem)]');

    const mobileNav = container.querySelector('nav[aria-label="Studio sections mobile"]') as HTMLElement;
    expect(mobileNav.className).toContain('pb-[env(safe-area-inset-bottom)]');
    expect(mobileNav.className).toContain('pl-[env(safe-area-inset-left)]');
    expect(mobileNav.className).toContain('pr-[env(safe-area-inset-right)]');
  });

  it('uses static viewport height in AiTab panel', () => {
    const container = render(<AiTab />);
    const shell = container.firstElementChild as HTMLElement;
    expect(shell.className).toContain('h-[calc(100svh-92px)]');
  });
});

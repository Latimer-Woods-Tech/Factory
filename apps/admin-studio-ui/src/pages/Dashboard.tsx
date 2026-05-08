/**
 * Dashboard shell. Tabs scaffold the major Studio surfaces; each tab will
 * fill in over Phases B–G. Phase A renders stub panels with real data
 * from /me and /tests so we can verify the auth + audit chain end-to-end.
 */
import { lazy, Suspense } from 'react';
import type { ComponentType, LazyExoticComponent } from 'react';
import { NavLink, Route, Routes, Navigate, useLocation } from 'react-router-dom';

interface TabDefinition {
  to: string;
  label: string;
  Component: LazyExoticComponent<ComponentType>;
  preload: () => Promise<unknown>;
}

function defineTab<T extends ComponentType>(
  to: string,
  label: string,
  importTab: () => Promise<{ default: T }>,
): TabDefinition {
  const Component = lazy(importTab);
  return {
    to,
    label,
    Component,
    preload: importTab,
  };
}

const TABS: ReadonlyArray<TabDefinition> = [
  defineTab('/overview', 'Overview', () =>
    import('./tabs/OverviewTab.js').then((m) => ({ default: m.OverviewTab })),
  ),
  defineTab('/tests', 'Tests', () =>
    import('./tabs/TestsTab.js').then((m) => ({ default: m.TestsTab })),
  ),
  defineTab('/code', 'Code', () =>
    import('./tabs/CodeTab.js').then((m) => ({ default: m.CodeTab })),
  ),
  defineTab('/ai', 'AI Chat', () =>
    import('./tabs/AiTab.js').then((m) => ({ default: m.AiTab })),
  ),
  defineTab('/functions', 'Functions', () =>
    import('./tabs/FunctionsTab.js').then((m) => ({ default: m.FunctionsTab })),
  ),
  defineTab('/timeline', 'Timeline', () =>
    import('./tabs/TimelineTab.js').then((m) => ({ default: m.TimelineTab })),
  ),
  defineTab('/flags', 'Flags', () =>
    import('./tabs/FlagsTab.js').then((m) => ({ default: m.FlagsTab })),
  ),
  defineTab('/audit', 'Audit Log', () =>
    import('./tabs/AuditTab.js').then((m) => ({ default: m.AuditTab })),
  ),
];

export function Dashboard() {
  const location = useLocation();
  const activeTab = TABS.find((tab) => location.pathname.endsWith(tab.to));

  function prefetchTab(tab: TabDefinition): void {
    if (activeTab?.to === tab.to) {
      return;
    }
    void tab.preload();
  }

  return (
    <div className="flex h-[calc(100vh-44px)] overflow-hidden">
      {/* Sidebar — desktop only */}
      <nav
        aria-label="Studio sections"
        className="hidden md:flex flex-col w-56 shrink-0 border-r border-slate-800 bg-slate-950 p-3 overflow-y-auto"
      >
        <ul className="space-y-1">
          {TABS.map((tab) => (
            <li key={tab.to}>
              <NavLink
                to={tab.to}
                onMouseEnter={() => prefetchTab(tab)}
                onFocus={() => prefetchTab(tab)}
                onTouchStart={() => prefetchTab(tab)}
                className={({ isActive }) =>
                  `block rounded px-3 py-2 text-sm ${
                    isActive ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                  }`
                }
              >
                {tab.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Main content — pad bottom on mobile so bottom nav doesn't overlap */}
      <main className="flex-1 overflow-auto p-4 md:p-6 pb-16 md:pb-6">
        <Suspense fallback={<TabSkeleton />}>
          <Routes>
            <Route path="/" element={<Navigate to="/overview" replace />} />
            {TABS.map((tab) => (
              <Route key={tab.to} path={tab.to} element={<tab.Component />} />
            ))}
          </Routes>
        </Suspense>
      </main>

      {/* Bottom nav — mobile only */}
      <nav
        aria-label="Studio sections mobile"
        className="flex md:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-950 border-t border-slate-800 overflow-x-auto"
      >
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            onMouseEnter={() => prefetchTab(tab)}
            onFocus={() => prefetchTab(tab)}
            onTouchStart={() => prefetchTab(tab)}
            className={({ isActive }) =>
              `flex-shrink-0 px-3 py-2 text-xs whitespace-nowrap ${
                isActive ? 'text-white border-b-2 border-emerald-500' : 'text-slate-400'
              }`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

function TabSkeleton() {
  return (
    <section className="animate-pulse space-y-4" aria-busy="true" aria-label="Loading tab">
      <div className="h-7 w-48 rounded bg-slate-800" />
      <div className="h-28 rounded bg-slate-900" />
      <div className="h-28 rounded bg-slate-900" />
    </section>
  );
}

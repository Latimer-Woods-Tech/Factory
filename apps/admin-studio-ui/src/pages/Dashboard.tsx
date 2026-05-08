/**
 * Dashboard shell. Tabs scaffold the major Studio surfaces; each tab will
 * fill in over Phases B–G. Phase A renders stub panels with real data
 * from /me and /tests so we can verify the auth + audit chain end-to-end.
 */
import { NavLink, Route, Routes, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { OverviewTab } from './tabs/OverviewTab.js';
import { TestsTab } from './tabs/TestsTab.js';
import { CodeTab } from './tabs/CodeTab.js';
import { AiTab } from './tabs/AiTab.js';
import { AuditTab } from './tabs/AuditTab.js';
import { FunctionsTab } from './tabs/FunctionsTab.js';
import { TimelineTab } from './tabs/TimelineTab.js';
import { FlagsTab } from './tabs/FlagsTab.js';

const TABS = [
  { to: '/overview',  label: 'Overview' },
  { to: '/tests',     label: 'Tests' },
  { to: '/code',      label: 'Code' },
  { to: '/ai',        label: 'AI Chat' },
  { to: '/functions', label: 'Functions' },
  { to: '/timeline',  label: 'Timeline' },
  { to: '/flags',     label: 'Flags' },
  { to: '/audit',     label: 'Audit Log' },
];

export function Dashboard() {
  useEffect(() => {
    const nav = navigator as Navigator & {
      virtualKeyboard?: { overlaysContent: boolean };
    };
    if (nav.virtualKeyboard) {
      nav.virtualKeyboard.overlaysContent = true;
    }
  }, []);

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
        <Routes>
          <Route path="/" element={<Navigate to="/overview" replace />} />
          <Route path="/overview" element={<OverviewTab />} />
          <Route path="/tests" element={<TestsTab />} />
          <Route path="/code" element={<CodeTab />} />
          <Route path="/ai" element={<AiTab />} />
          <Route path="/functions" element={<FunctionsTab />} />
          <Route path="/timeline" element={<TimelineTab />} />
          <Route path="/flags" element={<FlagsTab />} />
          <Route path="/audit" element={<AuditTab />} />
        </Routes>
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

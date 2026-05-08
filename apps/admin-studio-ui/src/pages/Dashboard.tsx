/**
 * Dashboard shell. Tabs scaffold the major Studio surfaces; each tab will
 * fill in over Phases B–G. Phase A renders stub panels with real data
 * from /me and /tests so we can verify the auth + audit chain end-to-end.
 */
import { NavLink, Route, Routes, Navigate } from 'react-router-dom';
import { OverviewTab } from './tabs/OverviewTab.js';
import { TestsTab } from './tabs/TestsTab.js';
import { CodeTab } from './tabs/CodeTab.js';
import { AiTab } from './tabs/AiTab.js';
import { AuditTab } from './tabs/AuditTab.js';
import { FunctionsTab } from './tabs/FunctionsTab.js';
import { TimelineTab } from './tabs/TimelineTab.js';
import { FlagsTab } from './tabs/FlagsTab.js';

const TABS = [
  { to: '/overview',  label: 'Overview', icon: 'OV' },
  { to: '/tests',     label: 'Tests', icon: 'TS' },
  { to: '/code',      label: 'Code', icon: 'CD' },
  { to: '/ai',        label: 'AI Chat', icon: 'AI' },
  { to: '/functions', label: 'Functions', icon: 'FN' },
  { to: '/timeline',  label: 'Timeline', icon: 'TM' },
  { to: '/flags',     label: 'Flags', icon: 'FG' },
  { to: '/audit',     label: 'Audit Log', icon: 'AU' },
];

export function Dashboard() {
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
              `flex min-h-12 min-w-14 flex-shrink-0 flex-col items-center justify-center gap-1 px-4 py-2 text-xs leading-none ${
                isActive ? 'text-white border-b-2 border-emerald-500' : 'text-slate-400'
              }`
            }
          >
            <span aria-hidden="true" className="text-xs leading-none font-semibold">{tab.icon}</span>
            <span>{tab.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

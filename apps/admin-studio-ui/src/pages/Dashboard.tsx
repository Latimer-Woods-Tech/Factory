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

const TABS = [
  { to: '/overview',  label: 'Overview' },
  { to: '/tests',     label: 'Tests' },
  { to: '/code',      label: 'Code' },
  { to: '/ai',        label: 'AI Chat' },
  { to: '/functions', label: 'Functions' },
  { to: '/timeline',  label: 'Timeline' },
  { to: '/audit',     label: 'Audit Log' },
];

export function Dashboard() {
  return (
    <div className="flex h-[calc(100vh-44px)]">
      <nav aria-label="Studio sections" className="w-56 border-r border-slate-800 bg-slate-950 p-3">
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

      <main className="flex-1 overflow-auto p-6">
        <Routes>
          <Route path="/" element={<Navigate to="/overview" replace />} />
          <Route path="/overview" element={<OverviewTab />} />
          <Route path="/tests" element={<TestsTab />} />
          <Route path="/code" element={<CodeTab />} />
          <Route path="/ai" element={<AiTab />} />
          <Route path="/functions" element={<FunctionsTab />} />
          <Route path="/timeline" element={<TimelineTab />} />
          <Route path="/audit" element={<AuditTab />} />
        </Routes>
      </main>
    </div>
  );
}

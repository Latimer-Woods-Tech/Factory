/**
 * Dashboard shell. Tabs scaffold the major Studio surfaces; each tab will
 * fill in over Phases B–G. Phase A renders stub panels with real data
 * from /me and /tests so we can verify the auth + audit chain end-to-end.
 */
import * as Dialog from '@radix-ui/react-dialog';
import { useState } from 'react';
import { NavLink, Route, Routes, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useSession } from '../stores/session.js';
import { OverviewTab } from './tabs/OverviewTab.js';
import { TestsTab } from './tabs/TestsTab.js';
import { CodeTab } from './tabs/CodeTab.js';
import { AiTab } from './tabs/AiTab.js';
import { AuditTab } from './tabs/AuditTab.js';
import { FunctionsTab } from './tabs/FunctionsTab.js';
import { TimelineTab } from './tabs/TimelineTab.js';
import { FlagsTab } from './tabs/FlagsTab.js';

interface Tab {
  to: string;
  label: string;
  mobileLabel: string;
  icon: string;
}

const OVERVIEW_TAB: Tab = { to: '/overview', label: 'Overview', mobileLabel: 'Overview', icon: 'O' };
const AI_TAB: Tab = { to: '/ai', label: 'AI Chat', mobileLabel: 'AI', icon: 'AI' };
const CODE_TAB: Tab = { to: '/code', label: 'Code', mobileLabel: 'Code', icon: 'C' };
const AUDIT_TAB: Tab = { to: '/audit', label: 'Audit Log', mobileLabel: 'Audit', icon: 'A' };
const FUNCTIONS_TAB: Tab = { to: '/functions', label: 'Functions', mobileLabel: 'Functions', icon: 'Fn' };
const TESTS_TAB: Tab = { to: '/tests', label: 'Tests', mobileLabel: 'Tests', icon: 'T' };
const TIMELINE_TAB: Tab = { to: '/timeline', label: 'Timeline', mobileLabel: 'Timeline', icon: 'Tl' };
const FLAGS_TAB: Tab = { to: '/flags', label: 'Flags', mobileLabel: 'Flags', icon: 'F' };

const TABS: ReadonlyArray<Tab> = [
  OVERVIEW_TAB,
  TESTS_TAB,
  CODE_TAB,
  AI_TAB,
  FUNCTIONS_TAB,
  TIMELINE_TAB,
  FLAGS_TAB,
  AUDIT_TAB,
];

export const PRIMARY_MOBILE_TABS: ReadonlyArray<Tab> = [
  OVERVIEW_TAB,
  AI_TAB,
  CODE_TAB,
  AUDIT_TAB,
  FUNCTIONS_TAB,
];

export const MORE_MOBILE_TABS: ReadonlyArray<Tab> = [TESTS_TAB, TIMELINE_TAB, FLAGS_TAB];

export function isMoreTabPath(pathname: string): boolean {
  return MORE_MOBILE_TABS.some((tab) => pathname.startsWith(tab.to));
}

export function Dashboard() {
  const [moreOpen, setMoreOpen] = useState(false);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { env, logout } = useSession();

  function handleSwitchEnvironment() {
    setMoreOpen(false);
    logout();
    navigate('/login', { replace: true });
  }

  function handleSignOut() {
    setMoreOpen(false);
    logout();
    navigate('/login', { replace: true });
  }

  const moreActive = moreOpen || isMoreTabPath(pathname);

  return (
    <Dialog.Root open={moreOpen} onOpenChange={setMoreOpen}>
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
          className="flex md:hidden fixed bottom-0 left-0 right-0 z-40 h-16 bg-slate-950 border-t border-slate-800"
        >
          {PRIMARY_MOBILE_TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) =>
                `flex min-w-0 flex-1 flex-col items-center justify-center border-t-2 px-1 ${
                  isActive ? 'border-emerald-500 text-white' : 'border-transparent text-slate-400'
                }`
              }
            >
              {({ isActive }) => <MobileTabGlyph icon={tab.icon} label={tab.mobileLabel} isActive={isActive} />}
            </NavLink>
          ))}

          <Dialog.Trigger asChild>
            <button
              type="button"
              aria-label="Open more sections"
              className={`flex min-w-0 flex-1 flex-col items-center justify-center border-t-2 px-1 ${
                moreActive ? 'border-emerald-500 text-white' : 'border-transparent text-slate-400'
              }`}
            >
              <MobileTabGlyph icon="···" label="More" isActive={moreActive} />
            </button>
          </Dialog.Trigger>
        </nav>
      </div>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-950/70 opacity-100 transition-opacity duration-200 data-[state=closed]:opacity-0 motion-reduce:transition-none" />
        <Dialog.Content
          className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border border-slate-800 bg-slate-950 p-4 pb-6 shadow-2xl transition-transform duration-200 data-[state=closed]:translate-y-full data-[state=open]:translate-y-0 motion-reduce:transition-none"
          aria-label="More studio sections"
        >
          <div className="mx-auto w-full max-w-md space-y-4">
            <header className="flex items-center justify-between">
              <Dialog.Title className="text-sm font-semibold text-white">More</Dialog.Title>
              <Dialog.Close asChild>
                <button type="button" className="rounded p-1 text-slate-300 hover:bg-slate-800 hover:text-white" aria-label="Close more sections">
                  ✕
                </button>
              </Dialog.Close>
            </header>

            <ul className="space-y-1">
              {MORE_MOBILE_TABS.map((tab) => (
                <li key={tab.to}>
                  <NavLink
                    to={tab.to}
                    onClick={() => setMoreOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center justify-between rounded px-3 py-2 text-sm ${
                        isActive ? 'bg-slate-800 text-white' : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                      }`
                    }
                  >
                    <span>{tab.label}</span>
                    <span className="text-xs text-slate-500">{tab.icon}</span>
                  </NavLink>
                </li>
              ))}
            </ul>

            <section className="rounded border border-slate-800 bg-slate-900 p-3">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Environment</h2>
              <p className="mt-1 text-sm text-white">Current: {env ?? 'unknown'}</p>
              <button
                type="button"
                onClick={handleSwitchEnvironment}
                className="mt-2 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 hover:border-slate-600"
              >
                Sign out to switch environment
              </button>
            </section>

            <button
              type="button"
              onClick={handleSignOut}
              className="w-full rounded bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-500"
            >
              Sign out
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function MobileTabGlyph({ icon, label, isActive }: { icon: string; label: string; isActive: boolean }) {
  return (
    <>
      <span
        aria-hidden="true"
        className={`flex h-5 min-w-5 items-center justify-center rounded-full border px-1 text-[11px] font-semibold leading-none ${
          isActive ? 'border-emerald-500 bg-emerald-500 text-slate-950' : 'border-slate-600 text-slate-300'
        }`}
      >
        {icon}
      </span>
      <span className="mt-1 text-[11px] leading-none">{label}</span>
    </>
  );
}

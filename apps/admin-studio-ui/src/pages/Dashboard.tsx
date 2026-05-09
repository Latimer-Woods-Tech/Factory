/**
 * Dashboard shell. Tabs scaffold the major Studio surfaces; each tab will
 * fill in over Phases B–G. Phase A renders stub panels with real data
 * from /me and /tests so we can verify the auth + audit chain end-to-end.
 */
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
import { Sheet, SheetContent, SheetClose, SheetTrigger } from '../components/ui/sheet.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';

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
  const activeTab = '/' + (pathname.split('/')[1] || 'overview');

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
    <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
      <div className="flex h-[calc(100vh-44px)] overflow-hidden">
        {/* Sidebar — desktop only */}
        <div className="hidden border-r border-border bg-muted/20 p-3 md:flex md:w-56 md:shrink-0">
          <Tabs
            value={activeTab}
            onValueChange={(value) => navigate(value)}
            orientation="vertical"
            className="w-full"
          >
            <TabsList className="h-auto w-full flex-col items-stretch bg-transparent p-0">
              {TABS.map((tab) => (
                <TabsTrigger
                  key={tab.to}
                  value={tab.to}
                  className="w-full justify-start data-[state=active]:bg-accent"
                >
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {/* Main content — pad bottom on mobile so bottom nav doesn't overlap */}
        <main className="flex-1 overflow-auto p-4 pb-16 md:p-6 md:pb-6">
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
          className="fixed bottom-0 left-0 right-0 z-40 flex h-16 border-t border-border bg-background md:hidden"
        >
          {PRIMARY_MOBILE_TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) =>
                `flex min-w-0 flex-1 flex-col items-center justify-center border-t-2 px-1 ${
                  isActive ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground'
                }`
              }
            >
              {({ isActive }) => <MobileTabGlyph icon={tab.icon} label={tab.mobileLabel} isActive={isActive} />}
            </NavLink>
          ))}

          <SheetTrigger asChild>
            <button
              type="button"
              aria-label="Open more sections"
              className={`flex min-w-0 flex-1 flex-col items-center justify-center border-t-2 px-1 ${
                moreActive ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground'
              }`}
            >
              <MobileTabGlyph icon="···" label="More" isActive={moreActive} />
            </button>
          </SheetTrigger>
        </nav>
      </div>

      {/* More drawer — bottom sheet, mobile only */}
      <SheetContent
        side="bottom"
        className="max-h-[70dvh] rounded-t-2xl p-4 pb-6 motion-reduce:transition-none"
        aria-label="More studio sections"
      >
        <div className="mx-auto w-full max-w-md space-y-4">
          <header className="flex items-center justify-between">
            <span className="text-sm font-semibold">More</span>
            <SheetClose asChild>
              <button
                type="button"
                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                aria-label="Close more sections"
              >
                ✕
              </button>
            </SheetClose>
          </header>

          <ul className="space-y-1">
            {MORE_MOBILE_TABS.map((tab) => (
              <li key={tab.to}>
                <NavLink
                  to={tab.to}
                  onClick={() => setMoreOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center justify-between rounded px-3 py-2 text-sm ${
                      isActive
                        ? 'bg-accent text-accent-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                    }`
                  }
                >
                  <span>{tab.label}</span>
                  <span className="text-xs text-muted-foreground">{tab.icon}</span>
                </NavLink>
              </li>
            ))}
          </ul>

          <section className="rounded border border-border bg-muted/30 p-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Environment</h2>
            <p className="mt-1 text-sm">Current: {env ?? 'unknown'}</p>
            <button
              type="button"
              onClick={handleSwitchEnvironment}
              className="mt-2 w-full rounded border border-border bg-background px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
            >
              Sign out to switch environment
            </button>
          </section>

          <button
            type="button"
            onClick={handleSignOut}
            className="w-full rounded bg-destructive px-3 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90"
          >
            Sign out
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function MobileTabGlyph({ icon, label, isActive }: { icon: string; label: string; isActive: boolean }) {
  return (
    <>
      <span
        aria-hidden="true"
        className={`flex h-5 min-w-5 items-center justify-center rounded-full border px-1 text-[11px] font-semibold leading-none ${
          isActive ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground'
        }`}
      >
        {icon}
      </span>
      <span className="mt-1 text-[11px] leading-none">{label}</span>
    </>
  );
}

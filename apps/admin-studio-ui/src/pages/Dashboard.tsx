/**
 * Dashboard shell. Tabs scaffold the major Studio surfaces.
 * Implements a responsive App Shell:
 * - Desktop: Left sidebar with icons.
 * - Mobile: Bottom navigation bar + "More" drawer.
 */
import { Suspense, useEffect } from 'react';
import { NavLink, Route, Routes, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { lazyWithRetry } from '../lib/lazyWithRetry.js';
import { Drawer, DrawerContent, DrawerTrigger, DrawerClose } from '../components/ui/drawer.js';
import { ThemeToggle } from '../components/ThemeToggle.js';
import { EnvironmentBanner } from '../components/EnvironmentBanner.js';
import {
  LayoutDashboard,
  TestTube,
  Code2,
  Bot,
  Zap,
  Wrench,
  BookOpen,
  Clock,
  Flag,
  ShieldCheck,
  Users,
  LayoutGrid,
  AlertTriangle,
  GitBranch,
  Menu,
  X
} from 'lucide-react';

const OverviewTab = lazyWithRetry(() => import('./tabs/OverviewTab.js').then(m => ({ default: m.OverviewTab })));
const TestsTab = lazyWithRetry(() => import('./tabs/TestsTab.js').then(m => ({ default: m.TestsTab })));
const CodeTab = lazyWithRetry(() => import('./tabs/CodeTab.js').then(m => ({ default: m.CodeTab })));
const AiTab = lazyWithRetry(() => import('./tabs/AiTab.js').then(m => ({ default: m.AiTab })));
const AuditTab = lazyWithRetry(() => import('./tabs/AuditTab.js').then(m => ({ default: m.AuditTab })));
const FunctionsTab = lazyWithRetry(() => import('./tabs/FunctionsTab.js').then(m => ({ default: m.FunctionsTab })));
const TimelineTab = lazyWithRetry(() => import('./tabs/TimelineTab.js').then(m => ({ default: m.TimelineTab })));
const FlagsTab = lazyWithRetry(() => import('./tabs/FlagsTab.js').then(m => ({ default: m.FlagsTab })));
const TrainingLibraryTab = lazyWithRetry(() => import('./tabs/TrainingLibraryTab.js').then(m => ({ default: m.TrainingLibraryTab })));
const CapabilitiesTab = lazyWithRetry(() => import('./tabs/CapabilitiesTab.js').then(m => ({ default: m.CapabilitiesTab })));
const CouncilTab = lazyWithRetry(() => import('./tabs/CouncilTab.js').then(m => ({ default: m.CouncilTab })));
const AppsTab = lazyWithRetry(() => import('./tabs/AppsTab.js').then(m => ({ default: m.AppsTab })));
const CommandCenterTab = lazyWithRetry(() => import('./tabs/CommandCenterTab.js').then(m => ({ default: m.CommandCenterTab })));
const GraphComposerTab = lazyWithRetry(() => import('./tabs/GraphComposerTab.js').then(m => ({ default: m.GraphComposerTab })));

const TABS = [
  { to: '/overview',  label: 'Overview', icon: LayoutDashboard },
  { to: '/ai',        label: 'AI Chat', icon: Bot },
  { to: '/tests',     label: 'Tests', icon: TestTube },
  { to: '/code',      label: 'Code', icon: Code2 },
  { to: '/capabilities', label: 'Capabilities', icon: Zap },
  { to: '/functions', label: 'Functions', icon: Wrench },
  { to: '/training-library', label: 'Training Library', icon: BookOpen },
  { to: '/timeline',  label: 'Timeline', icon: Clock },
  { to: '/flags',     label: 'Flags', icon: Flag },
  { to: '/audit',     label: 'Audit Log', icon: ShieldCheck },
  { to: '/council',   label: 'Council', icon: Users },
  { to: '/apps',      label: 'Apps', icon: LayoutGrid },
  { to: '/command-center', label: 'Command Center', icon: AlertTriangle },
  { to: '/graph-composer', label: 'Graph Composer', icon: GitBranch },
];

// Mobile bottom nav shows first 4 tabs, rest go in "More"
const MOBILE_MAIN_TABS = TABS.slice(0, 4);
const MOBILE_MORE_TABS = TABS.slice(4);

export function Dashboard() {
  const location = useLocation();
  const activeTab = '/' + (location.pathname.split('/')[1] || 'overview');
  const currentTabObj = TABS.find(t => t.to === activeTab) || TABS[0]!;

  // ADM-9.3: opt the entire app into VirtualKeyboard API overlay mode so the
  // AI composer footer can pin itself to the keyboard inset instead of being
  // pushed up by the browser's default resize-content behaviour.
  useEffect(() => {
    const nav = navigator as Navigator & {
      virtualKeyboard?: { overlaysContent: boolean };
    };
    if (nav.virtualKeyboard) {
      nav.virtualKeyboard.overlaysContent = true;
    }
  }, []);

  return (
    <div className="flex flex-col h-[100dvh] overflow-hidden bg-background text-foreground pt-safe-top md:pt-0">
      {/* Top Header (Mobile & Desktop) */}
      <EnvironmentBanner />
      <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded bg-primary text-primary-foreground font-bold">
            F
          </div>
          <h1 className="font-semibold text-lg hidden sm:block">Factory Admin Studio</h1>
          <h1 className="font-semibold text-lg sm:hidden">{currentTabObj.label}</h1>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar — desktop only */}
        <aside className="hidden md:flex flex-col w-64 border-r border-border bg-muted/10 overflow-y-auto">
          <nav className="flex-1 px-3 py-4 space-y-1">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.to;
              return (
                <NavLink
                  key={tab.to}
                  to={tab.to}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                    isActive 
                      ? 'bg-primary/10 text-primary' 
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </NavLink>
              );
            })}
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-auto p-4 pb-[calc(env(safe-area-inset-bottom)+4rem)] md:p-6 md:pb-6 relative">
          <Suspense fallback={<div className="flex items-center justify-center h-32 text-slate-500 text-sm">Loading…</div>}>
            <Routes>
              <Route path="/" element={<Navigate to="/overview" replace />} />
              <Route path="/overview" element={<OverviewTab />} />
              <Route path="/tests" element={<TestsTab />} />
              <Route path="/code" element={<CodeTab />} />
              <Route path="/ai" element={<AiTab />} />
              <Route path="/capabilities" element={<CapabilitiesTab />} />
              <Route path="/functions" element={<FunctionsTab />} />
              <Route path="/training-library" element={<TrainingLibraryTab />} />
              <Route path="/timeline" element={<TimelineTab />} />
              <Route path="/flags" element={<FlagsTab />} />
              <Route path="/audit" element={<AuditTab />} />
              <Route path="/council" element={<CouncilTab />} />
              <Route path="/apps" element={<AppsTab />} />
              <Route path="/command-center" element={<CommandCenterTab />} />
              <Route path="/graph-composer" element={<GraphComposerTab />} />
            </Routes>
          </Suspense>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 border-t border-border bg-card pb-safe pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] z-40">
        <div className="flex items-center justify-around px-2 py-2">
          {MOBILE_MAIN_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.to;
            return (
              <NavLink
                key={tab.to}
                to={tab.to}
                className={`target-min flex flex-col items-center justify-center rounded-lg transition-colors ${
                  isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{tab.label}</span>
              </NavLink>
            );
          })}
          
          {/* More Drawer Trigger */}
          <Drawer>
            <DrawerTrigger asChild>
              <button className={`target-min flex flex-col items-center justify-center rounded-lg transition-colors ${
                MOBILE_MORE_TABS.some(t => t.to === activeTab) ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              }`}>
                <Menu className="w-5 h-5" />
                <span className="text-[10px] font-medium">More</span>
              </button>
            </DrawerTrigger>
            <DrawerContent>
              <div className="px-4 py-6 space-y-4">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-lg font-semibold">More Sections</h2>
                  <DrawerClose className="p-2 rounded-full hover:bg-muted">
                    <X className="w-5 h-5" />
                  </DrawerClose>
                </div>
                <nav className="grid grid-cols-2 gap-2">
                  {MOBILE_MORE_TABS.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.to;
                    return (
                      <DrawerClose asChild key={tab.to}>
                        <NavLink
                          to={tab.to}
                          className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                            isActive 
                              ? 'bg-primary/10 text-primary' 
                              : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                          }`}
                        >
                          <Icon className="w-5 h-5" />
                          {tab.label}
                        </NavLink>
                      </DrawerClose>
                    );
                  })}
                </nav>
              </div>
            </DrawerContent>
          </Drawer>
        </div>
      </nav>
    </div>
  );
}

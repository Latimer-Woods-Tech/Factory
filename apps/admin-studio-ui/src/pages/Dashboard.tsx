/**
 * Dashboard shell — grouped navigation with maturity indicators.
 *
 * Sidebar (desktop): 4 sections with labels + maturity dots.
 * Bottom nav (mobile): 4 pinned primary tabs + grouped More drawer.
 * Tabs are lazy-loaded via React.lazy (see #968).
 */
import { lazy, Suspense } from 'react';
import { NavLink, Route, Routes, Navigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Bot, TestTube, Code2, Zap, Wrench,
  BookOpen, Clock, Flag, ShieldCheck, BarChart2, Menu, X
} from 'lucide-react';
import { Drawer, DrawerContent, DrawerTrigger, DrawerClose } from '../components/ui/drawer.js';
import { EnvironmentBanner } from '../components/EnvironmentBanner.js';
import { ThemeToggle } from '../components/ThemeToggle.js';

const OverviewTab        = lazy(() => import('./tabs/OverviewTab.js').then(m => ({ default: m.OverviewTab })));
const AiTab             = lazy(() => import('./tabs/AiTab.js').then(m => ({ default: m.AiTab })));
const TestsTab          = lazy(() => import('./tabs/TestsTab.js').then(m => ({ default: m.TestsTab })));
const CodeTab           = lazy(() => import('./tabs/CodeTab.js').then(m => ({ default: m.CodeTab })));
const CapabilitiesTab   = lazy(() => import('./tabs/CapabilitiesTab.js').then(m => ({ default: m.CapabilitiesTab })));
const FunctionsTab      = lazy(() => import('./tabs/FunctionsTab.js').then(m => ({ default: m.FunctionsTab })));
const TrainingLibraryTab = lazy(() => import('./tabs/TrainingLibraryTab.js').then(m => ({ default: m.TrainingLibraryTab })));
const TimelineTab       = lazy(() => import('./tabs/TimelineTab.js').then(m => ({ default: m.TimelineTab })));
const FlagsTab          = lazy(() => import('./tabs/FlagsTab.js').then(m => ({ default: m.FlagsTab })));
const AuditTab          = lazy(() => import('./tabs/AuditTab.js').then(m => ({ default: m.AuditTab })));
const QualityTab        = lazy(() => import('./tabs/QualityTab.js').then(m => ({ default: m.QualityTab })));

type Maturity = 'live' | 'partial' | 'stub';

interface TabDef {
  to: string;
  label: string;
  icon: React.ElementType;
  maturity: Maturity;
}

interface NavGroup {
  label: string;
  tabs: TabDef[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Monitor',
    tabs: [
      { to: '/overview', label: 'Overview',  icon: LayoutDashboard, maturity: 'live' },
      { to: '/quality',  label: 'Quality',   icon: BarChart2,       maturity: 'partial' },
      { to: '/timeline', label: 'Timeline',  icon: Clock,           maturity: 'live' },
    ],
  },
  {
    label: 'Build',
    tabs: [
      { to: '/ai',    label: 'AI Chat', icon: Bot,      maturity: 'live' },
      { to: '/code',  label: 'Code',    icon: Code2,    maturity: 'live' },
      { to: '/tests', label: 'Tests',   icon: TestTube, maturity: 'live' },
    ],
  },
  {
    label: 'Platform',
    tabs: [
      { to: '/capabilities', label: 'Capabilities', icon: Zap,    maturity: 'live' },
      { to: '/flags',        label: 'Flags',        icon: Flag,   maturity: 'live' },
      { to: '/functions',    label: 'Functions',    icon: Wrench, maturity: 'live' },
    ],
  },
  {
    label: 'System',
    tabs: [
      { to: '/audit',            label: 'Audit Log',       icon: ShieldCheck, maturity: 'live' },
      { to: '/training-library', label: 'Training Library', icon: BookOpen,   maturity: 'partial' },
    ],
  },
];

// Flat list for routing + mobile primary
const ALL_TABS: TabDef[] = NAV_GROUPS.flatMap(g => g.tabs);
const MOBILE_PRIMARY: TabDef[] = [
  ALL_TABS.find(t => t.to === '/overview')!,
  ALL_TABS.find(t => t.to === '/ai')!,
  ALL_TABS.find(t => t.to === '/code')!,
  ALL_TABS.find(t => t.to === '/tests')!,
];
const MOBILE_MORE_GROUPS: NavGroup[] = NAV_GROUPS.map(g => ({
  ...g,
  tabs: g.tabs.filter(t => !MOBILE_PRIMARY.includes(t)),
})).filter(g => g.tabs.length > 0);

const MATURITY_DOT: Record<Maturity, string> = {
  live:    'bg-emerald-500',
  partial: 'bg-amber-400',
  stub:    'bg-slate-600',
};

const MATURITY_TITLE: Record<Maturity, string> = {
  live:    'Fully wired',
  partial: 'Partially wired — some endpoints pending',
  stub:    'Placeholder — not yet implemented',
};

function MaturityDot({ maturity }: { maturity: Maturity }) {
  return (
    <span
      title={MATURITY_TITLE[maturity]}
      className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${MATURITY_DOT[maturity]}`}
    />
  );
}

const TAB_LOADING = (
  <div className="flex items-center justify-center h-32 text-slate-500 text-sm">Loading…</div>
);

export function Dashboard() {
  const location = useLocation();
  const activeTab = '/' + (location.pathname.split('/')[1] || 'overview');
  const currentTab = ALL_TABS.find(t => t.to === activeTab) || ALL_TABS[0]!;

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background text-foreground">
      <EnvironmentBanner />

      {/* Top header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded bg-primary text-primary-foreground font-bold text-sm">
            F
          </div>
          <div className="hidden sm:flex flex-col">
            <span className="font-semibold text-sm leading-none">Factory Admin Studio</span>
          </div>
          <span className="font-semibold text-sm sm:hidden">{currentTab.label}</span>
        </div>
        <ThemeToggle />
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Desktop sidebar */}
        <aside className="hidden md:flex flex-col w-56 border-r border-border bg-muted/10 overflow-y-auto shrink-0">
          <nav className="flex-1 px-2 py-3 space-y-4">
            {NAV_GROUPS.map(group => (
              <div key={group.label}>
                <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                  {group.label}
                </p>
                <div className="space-y-0.5">
                  {group.tabs.map(tab => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.to;
                    return (
                      <NavLink
                        key={tab.to}
                        to={tab.to}
                        className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                          isActive
                            ? 'bg-primary/10 text-primary'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                        }`}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        <span className="flex-1 truncate">{tab.label}</span>
                        <MaturityDot maturity={tab.maturity} />
                      </NavLink>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-auto p-4 pb-24 md:p-6 md:pb-6">
          <Suspense fallback={TAB_LOADING}>
            <Routes>
              <Route path="/" element={<Navigate to="/overview" replace />} />
              <Route path="/overview"          element={<OverviewTab />} />
              <Route path="/ai"                element={<AiTab />} />
              <Route path="/tests"             element={<TestsTab />} />
              <Route path="/code"              element={<CodeTab />} />
              <Route path="/capabilities"      element={<CapabilitiesTab />} />
              <Route path="/functions"         element={<FunctionsTab />} />
              <Route path="/training-library"  element={<TrainingLibraryTab />} />
              <Route path="/timeline"          element={<TimelineTab />} />
              <Route path="/flags"             element={<FlagsTab />} />
              <Route path="/audit"             element={<AuditTab />} />
              <Route path="/quality"           element={<QualityTab />} />
            </Routes>
          </Suspense>
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 border-t border-border bg-card pb-safe z-40">
        <div className="flex items-center justify-around px-2 py-2">
          {MOBILE_PRIMARY.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.to;
            return (
              <NavLink
                key={tab.to}
                to={tab.to}
                className={`flex flex-col items-center justify-center w-16 py-1 gap-1 rounded-lg transition-colors ${
                  isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{tab.label}</span>
              </NavLink>
            );
          })}

          <Drawer>
            <DrawerTrigger asChild>
              <button
                className={`flex flex-col items-center justify-center w-16 py-1 gap-1 rounded-lg transition-colors ${
                  MOBILE_MORE_GROUPS.flatMap(g => g.tabs).some(t => t.to === activeTab)
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Menu className="w-5 h-5" />
                <span className="text-[10px] font-medium">More</span>
              </button>
            </DrawerTrigger>
            <DrawerContent>
              <div className="px-4 py-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold">More Sections</h2>
                  <DrawerClose className="p-1.5 rounded-full hover:bg-muted">
                    <X className="w-4 h-4" />
                  </DrawerClose>
                </div>
                {MOBILE_MORE_GROUPS.map(group => (
                  <div key={group.label} className="mb-4">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-2">
                      {group.label}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {group.tabs.map(tab => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.to;
                        return (
                          <DrawerClose asChild key={tab.to}>
                            <NavLink
                              to={tab.to}
                              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                                isActive
                                  ? 'bg-primary/10 text-primary'
                                  : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                              }`}
                            >
                              <Icon className="w-4 h-4 shrink-0" />
                              <span className="truncate">{tab.label}</span>
                              <MaturityDot maturity={tab.maturity} />
                            </NavLink>
                          </DrawerClose>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </DrawerContent>
          </Drawer>
        </div>
      </nav>
    </div>
  );
}

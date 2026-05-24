/**
 * Dashboard shell. Tabs scaffold the major Studio surfaces.
 * Implements a responsive App Shell:
 * - Desktop: Left sidebar with icons.
 * - Mobile: Bottom navigation bar + "More" drawer.
 */
import { NavLink, Route, Routes, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { OverviewTab } from './tabs/OverviewTab.js';
import { TestsTab } from './tabs/TestsTab.js';
import { CodeTab } from './tabs/CodeTab.js';
import { AiTab } from './tabs/AiTab.js';
import { AuditTab } from './tabs/AuditTab.js';
import { FunctionsTab } from './tabs/FunctionsTab.js';
import { TimelineTab } from './tabs/TimelineTab.js';
import { FlagsTab } from './tabs/FlagsTab.js';
import { TrainingLibraryTab } from './tabs/TrainingLibraryTab.js';
import { CapabilitiesTab } from './tabs/CapabilitiesTab.js';
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
  Menu,
  X
} from 'lucide-react';

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
];

// Mobile bottom nav shows first 4 tabs, rest go in "More"
const MOBILE_MAIN_TABS = TABS.slice(0, 4);
const MOBILE_MORE_TABS = TABS.slice(4);

export function Dashboard() {
  const location = useLocation();
  const activeTab = '/' + (location.pathname.split('/')[1] || 'overview');
  const currentTabObj = TABS.find(t => t.to === activeTab) || TABS[0];

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background text-foreground">
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
        <main className="flex-1 overflow-auto p-4 pb-24 md:p-6 md:pb-6 relative">
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
          </Routes>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 border-t border-border bg-card pb-safe z-40">
        <div className="flex items-center justify-around px-2 py-2">
          {MOBILE_MAIN_TABS.map((tab) => {
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
          
          {/* More Drawer Trigger */}
          <Drawer>
            <DrawerTrigger asChild>
              <button className={`flex flex-col items-center justify-center w-16 py-1 gap-1 rounded-lg transition-colors ${
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

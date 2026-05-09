/**
 * Dashboard shell. Tabs scaffold the major Studio surfaces; each tab will
 * fill in over Phases B–G. Phase A renders stub panels with real data
 * from /me and /tests so we can verify the auth + audit chain end-to-end.
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
import { Button } from '../components/ui/button.js';
import { Drawer, DrawerContent, DrawerTrigger } from '../components/ui/drawer.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';

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
  const location = useLocation();
  const navigate = useNavigate();
  const activeTab = '/' + (location.pathname.split('/')[1] || 'overview');

  return (
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
      <main className="relative flex-1 overflow-auto p-4 pb-20 md:p-6 md:pb-6">
        <div className="mb-3 flex justify-end md:hidden">
          <Drawer>
            <DrawerTrigger asChild>
              <Button variant="outline" size="sm">Open sections</Button>
            </DrawerTrigger>
            <DrawerContent>
              <nav aria-label="Studio sections mobile" className="space-y-2 pb-2">
                {TABS.map((tab) => (
                  <NavLink
                    key={tab.to}
                    to={tab.to}
                    className={({ isActive }) =>
                      `block rounded-md px-3 py-2 text-sm ${
                        isActive
                          ? 'bg-accent text-accent-foreground'
                          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                      }`
                    }
                  >
                    {tab.label}
                  </NavLink>
                ))}
              </nav>
            </DrawerContent>
          </Drawer>
        </div>
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
    </div>
  );
}

import { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useSession } from './stores/session.js';
import { EnvironmentBanner } from './components/EnvironmentBanner.js';
import { ThemeToggle } from './components/ThemeToggle.js';
import { NotificationsContainer } from './components/NotificationsContainer.js';
import { LoginPage } from './pages/LoginPage.js';
import { Dashboard } from './pages/Dashboard.js';

function LoginRedirect() {
  const { pathname, search } = useLocation();
  return <Navigate to={`/login?next=${encodeURIComponent(pathname + search)}`} replace />;
}

export default function App() {
  const { hydrate, isAuthed } = useSession();

  useEffect(() => { hydrate(); }, [hydrate]);

  if (!isAuthed()) {
    return (
      <>
        <NotificationsContainer />
        <div className="fixed right-3 top-3 z-50">
          <ThemeToggle />
        </div>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="*" element={<LoginRedirect />} />
        </Routes>
      </>
    );
  }

  return (
    <>
      <NotificationsContainer />
      <EnvironmentBanner />
      <div className="fixed right-3 top-14 z-50">
        <ThemeToggle />
      </div>
      <Routes>
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="/*" element={<Dashboard />} />
      </Routes>
    </>
  );
}

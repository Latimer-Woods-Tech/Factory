import { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useSession } from './stores/session.js';
import { EnvironmentBanner } from './components/EnvironmentBanner.js';
import { LoginPage } from './pages/LoginPage.js';
import { Dashboard } from './pages/Dashboard.js';

/** Redirects to /login while preserving the intended destination in ?next=. */
function RequireAuth() {
  const location = useLocation();
  return (
    <Navigate
      to={`/login?next=${encodeURIComponent(location.pathname)}`}
      replace
    />
  );
}

export default function App() {
  const { hydrate, isAuthed } = useSession();

  useEffect(() => { hydrate(); }, [hydrate]);

  if (!isAuthed()) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<RequireAuth />} />
      </Routes>
    );
  }

  return (
    <>
      <EnvironmentBanner />
      <Routes>
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="/*" element={<Dashboard />} />
      </Routes>
    </>
  );
}

/**
 * Top navigation bar.
 *
 * Shows the authenticated user's email and role. Provides nav links to
 * Dashboard, Runs, and (future) Setup / Templates / Schedule sections.
 */

'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { clearToken, getStoredEmail, getStoredRole, isAuthenticated } from '@/lib/auth';

const NAV_LINKS = [
  { href: '/',     label: 'Dashboard' },
  { href: '/runs', label: 'Runs' },
];

export function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [role, setRole]   = useState<string | null>(null);

  useEffect(() => {
    setEmail(getStoredEmail());
    setRole(getStoredRole());
  }, []);

  function handleLogout() {
    clearToken();
    router.push('/login');
  }

  return (
    <header className="border-b border-gray-200 bg-white shadow-sm">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 text-brand-700 font-semibold text-sm">
          <span className="text-lg">🔬</span>
          QA Tools
        </Link>

        {/* Nav links */}
        <nav className="flex items-center gap-1">
          {NAV_LINKS.map(({ href, label }) => {
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={[
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  active
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                ].join(' ')}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Spacer */}
        <div className="flex-1" />

        {/* User info */}
        {isAuthenticated() ? (
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500 hidden sm:block">
              {email ?? 'dev'}{' '}
              {role && (
                <span className="badge bg-gray-100 text-gray-600 ml-1">{role}</span>
              )}
            </span>
            <button
              onClick={handleLogout}
              className="text-xs text-gray-500 hover:text-gray-800 transition-colors"
            >
              Sign out
            </button>
          </div>
        ) : (
          <Link href="/login" className="btn-primary text-xs py-1.5">
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}

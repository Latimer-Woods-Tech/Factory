/**
 * The persistent environment banner — Safeguard #1.
 *
 * Always visible at the top of the app. Color matches the active env.
 * Click → opens an env switcher (forces re-auth).
 */
import { useSession } from '../stores/session.js';
import type { Environment } from '@latimer-woods-tech/studio-core';

const STYLES: Record<Environment, { bg: string; ring: string; label: string }> = {
  local:      { bg: 'bg-slate-700',   ring: 'ring-slate-500',   label: '⚙️ LOCAL DEV'    },
  staging:    { bg: 'bg-amber-700',   ring: 'ring-amber-400',   label: '🧪 STAGING'      },
  production: { bg: 'bg-red-800',     ring: 'ring-red-400',     label: '🔴 PRODUCTION'   },
};

export function EnvironmentBanner() {
  const { env, user, logout, expiresAt } = useSession();

  if (!env) return null;
  const style = STYLES[env];
  const remaining = expiresAt ? Math.max(0, expiresAt - Date.now()) : 0;
  const remainingLabel = formatRemaining(remaining);

  return (
    <header
      role="banner"
      aria-label={`Active environment: ${env}`}
      className={`${style.bg} ${style.ring} ring-1 ring-inset sticky top-0 z-50 px-3 py-2 flex flex-wrap items-center justify-between gap-y-1 text-white overflow-hidden`}
    >
      <div className="flex items-center gap-2 font-semibold text-sm tracking-wide min-w-0 shrink-0">
        <span className="truncate">{style.label}</span>
        {env === 'production' && (
          <span className="hidden sm:inline text-xs font-normal opacity-90">
            • mutating actions require type-to-confirm
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 text-xs min-w-0 flex-wrap">
        <span className="opacity-90 truncate max-w-[120px] sm:max-w-none">{user?.email}</span>
        <span className="hidden sm:inline opacity-75">role: {user?.role}</span>
        <span className="hidden sm:inline opacity-75">session: {remainingLabel}</span>
        <button
          onClick={logout}
          className="rounded bg-white/15 hover:bg-white/25 px-2 py-1 text-xs font-medium whitespace-nowrap"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return 'expired';
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  return `${hours}h${rem.toString().padStart(2, '0')}`;
}

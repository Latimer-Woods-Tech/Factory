/**
 * The persistent environment banner — Safeguard #1.
 *
 * Always visible at the top of the app. Color matches the active env.
 * Click → opens an env switcher (forces re-auth).
 */
import { useSession } from '../stores/session.js';
import { getTargetEnv, setTargetEnv } from '../lib/env-config.js';
import type { Environment } from '@latimer-woods-tech/studio-core';

const STYLES: Record<Environment, { bg: string; ring: string; label: string }> = {
  local:      { bg: 'bg-slate-700',   ring: 'ring-slate-500',   label: '⚙️ LOCAL DEV'    },
  staging:    { bg: 'bg-amber-700',   ring: 'ring-amber-400',   label: '🧪 STAGING'      },
  production: { bg: 'bg-red-800',     ring: 'ring-red-400',     label: '🔴 PRODUCTION'   },
};

/**
 * Switches the stored target environment, clears the current session, and
 * forces a full-page navigation to /login so the user must re-authenticate
 * against the newly selected backend.
 */
function switchEnv(newEnv: Environment, logout: () => void): void {
  setTargetEnv(newEnv);
  logout();
  // Use a hard redirect so that any in-memory state is fully discarded.
  window.location.href = '/login';
}

export function EnvironmentBanner() {
  const { env, user, logout, expiresAt } = useSession();

  // The banner always reflects the runtime-stored env, not just the session
  // env, so it stays accurate after a switch-without-reload edge case.
  const displayEnv: Environment = env ?? getTargetEnv();
  const style = STYLES[displayEnv];

  if (!env) return null;
  const remaining = expiresAt ? Math.max(0, expiresAt - Date.now()) : 0;
  const remainingLabel = formatRemaining(remaining);

  return (
    <header
      role="banner"
      aria-label={`Active environment: ${displayEnv}`}
      className={`${style.bg} ${style.ring} ring-1 ring-inset sticky top-0 z-50 px-4 py-2 flex items-center justify-between text-white`}
    >
      <div className="flex items-center gap-3 font-semibold text-sm tracking-wide">
        <span>{style.label}</span>
        {displayEnv === 'production' && (
          <span className="text-xs font-normal opacity-90">
            • mutating actions require type-to-confirm
          </span>
        )}
      </div>

      <div className="flex items-center gap-4 text-xs">
        <span className="opacity-90">{user?.email}</span>
        <span className="opacity-75">role: {user?.role}</span>
        <span className="opacity-75">session: {remainingLabel}</span>
        <button
          onClick={() => switchEnv(displayEnv, logout)}
          className="rounded bg-white/15 hover:bg-white/25 px-2 py-1 text-xs font-medium"
        >
          Switch env / sign out
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

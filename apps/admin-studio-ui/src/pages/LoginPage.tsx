/**
 * Login page with explicit env picker — the user must consciously pick
 * the environment before authenticating. This is Safeguard #3
 * (Environment Lock-In) made visible at session start.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Environment } from '@latimer-woods-tech/studio-core';
import { useSession } from '../stores/session.js';
import { apiFetch } from '../lib/api.js';
import { setTargetEnv } from '../lib/env-config.js';

const ENV_CARDS: Array<{ env: Environment; title: string; subtitle: string; classes: string }> = [
  { env: 'local',      title: 'Local',      subtitle: 'Your dev box. Sandbox.',                 classes: 'bg-slate-800 hover:ring-slate-400'   },
  { env: 'staging',    title: 'Staging',    subtitle: 'Shared pre-prod. QA + integration.',     classes: 'bg-amber-900 hover:ring-amber-400'   },
  { env: 'production', title: 'Production', subtitle: 'LIVE traffic. Type-to-confirm enforced.', classes: 'bg-red-900 hover:ring-red-400'      },
];

export function LoginPage() {
  const [env, setEnv] = useState<Environment | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const login = useSession((s) => s.login);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!env) return;
    setError(null);
    setSubmitting(true);
    try {
      // Persist the chosen env before making the auth call so the request is
      // routed to the correct backend via getApiBase().
      setTargetEnv(env);
      const res = await apiFetch<{ token: string; expiresAt: number }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password, env }),
      });
      login(res.token, env, res.expiresAt);
      // Redirect to the originally requested path if the router preserved it in ?next=.
      const params = new URLSearchParams(window.location.search);
      const next = params.get('next') ?? '/';
      navigate(next, { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm mx-auto">
        <h1 className="text-2xl font-bold text-white">Factory Admin Studio</h1>
        <p className="mt-1 text-sm text-slate-400">
          Step 1 — choose the environment you intend to operate against.
        </p>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {ENV_CARDS.map((card) => (
            <button
              key={card.env}
              type="button"
              onClick={() => setEnv(card.env)}
              aria-pressed={env === card.env}
              className={`${card.classes} rounded-lg p-4 text-left transition ring-1 ring-transparent ${
                env === card.env ? 'ring-white' : ''
              }`}
            >
              <div className="text-base font-semibold text-white">{card.title}</div>
              <div className="mt-1 text-xs text-white/80">{card.subtitle}</div>
            </button>
          ))}
        </div>

        {env && (
          <form onSubmit={handleSubmit} className="mt-8 space-y-3">
            <p className="text-sm text-slate-400">
              Step 2 — sign in. You'll be locked to <strong>{env}</strong> until you sign out.
            </p>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email"
              autoComplete="username"
              className="w-full rounded bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white"
            />
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="password"
              autoComplete="current-password"
              className="w-full rounded bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white"
            />
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-emerald-500"
            >
              {submitting ? 'Signing in…' : `Sign in to ${env}`}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

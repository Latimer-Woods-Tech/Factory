/**
 * Login page with explicit env picker — the user must consciously pick
 * the environment before authenticating. This is Safeguard #3
 * (Environment Lock-In) made visible at session start.
 */
import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { Environment } from '@latimer-woods-tech/studio-core';
import { useSession } from '../stores/session.js';
import { getApiBase } from '../lib/api.js';

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
  const [checkingGoogleAuth, setCheckingGoogleAuth] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const login = useSession((s) => s.login);
  const googleButtonRef = useRef<HTMLDivElement>(null);

  // Initialize Google Sign-In when env is selected
  useEffect(() => {
    if (!env || !googleButtonRef.current) return;

    const google = (window as any).google;
    if (!google) return;

    // Clear any previously rendered button
    googleButtonRef.current.innerHTML = '';

    // Determine the client ID (would normally come from backend or env vars)
    // For now, initialize the button without a specific client ID
    // The actual client ID will be set by the backend or environment
    try {
      google.accounts.id.initialize({
        callback: handleGoogleCallback,
        hosted_domain: 'apunlimited.com',
      });

      google.accounts.id.renderButton(googleButtonRef.current, {
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'pill',
        width: '320',
      });

      // Also try to render the One Tap experience
      google.accounts.id.prompt();
    } catch (err) {
      console.warn('Failed to initialize Google Sign-In:', err);
    }
  }, [env]);

  async function handleGoogleCallback(response: any) {
    if (!env) return;

    setError(null);
    setSubmitting(true);

    try {
      const base = getApiBase(env);
      const res = await fetch(`${base}/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          credential: response.credential || response,
          env,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        let msg = `Login failed (${res.status})`;
        try {
          const json = JSON.parse(text) as { error?: string; detail?: string };
          msg = json.error ?? msg;
          if (json.detail) msg = `${msg}: ${json.detail}`;
        } catch {
          /* ignore */
        }
        throw new Error(msg);
      }

      const data = (await res.json()) as { token: string; expiresAt: number };
      login(data.token, env, data.expiresAt);
      navigate(searchParams.get('next') ?? '/');
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!env) return;
    setError(null);
    setSubmitting(true);
    try {
      const base = getApiBase(env);
      const res = await fetch(`${base}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, env }),
      });
      if (!res.ok) {
        const text = await res.text();
        let msg = `Login failed (${res.status})`;
        try { msg = (JSON.parse(text) as { error?: string }).error ?? msg; } catch { /* ignore */ }
        throw new Error(msg);
      }
      const data = (await res.json()) as { token: string; expiresAt: number };
      login(data.token, env, data.expiresAt);
      navigate(searchParams.get('next') ?? '/');
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
          <div className="mt-8 space-y-6">
            <div>
              <p className="text-sm text-slate-400">
                Step 2 — sign in. You'll be locked to <strong>{env}</strong> until you sign out.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-white mb-3">Recommended</h3>
                <p className="text-xs text-white/80 mb-3">
                  Sign in with your allowlisted Google account. Verified Google identity is the primary production path.
                </p>
                <div className="flex justify-center" ref={googleButtonRef} />
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-700" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-slate-950 text-slate-400">or</span>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-white mb-3">Fallback operator login</h3>
                <p className="text-xs text-white/80 mb-3">
                  Use the shared bootstrap password only for break-glass access or initial recovery.
                </p>

                <form onSubmit={handleSubmit} className="space-y-3">
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
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

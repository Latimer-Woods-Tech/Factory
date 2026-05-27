/**
 * Login page.
 *
 * Phase 1 login: paste a pre-minted QA JWT directly.
 * Tokens are minted by POST /auth/token on the qa-tools-worker.
 *
 * Phase 2 will add a proper email+password flow once credentials are implemented.
 *
 * See: docs/architecture/QA_TOOLS_ARCHITECTURE.md §2.3
 */

'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { setToken, isAuthenticated, decodeJwtPayload } from '@/lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const [token, setTokenInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Redirect to dashboard if already authenticated.
  useEffect(() => {
    if (isAuthenticated()) router.replace('/');
  }, [router]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmed = token.trim();
    if (!trimmed) {
      setError('Paste your JWT token above.');
      return;
    }

    // Validate token shape (3 parts)
    const parts = trimmed.split('.');
    if (parts.length !== 3) {
      setError('Invalid token format — expected a 3-part JWT (header.payload.signature).');
      return;
    }

    // Decode and check expiry client-side
    const payload = decodeJwtPayload(trimmed);
    if (!payload) {
      setError('Could not decode token payload. Verify the JWT is valid.');
      return;
    }
    if (typeof payload['exp'] === 'number' && payload['exp'] < Math.floor(Date.now() / 1000)) {
      setError('This token has expired. Mint a new one from the worker or your CI script.');
      return;
    }

    setToken(trimmed);
    router.replace('/');
  }

  return (
    <div className="mx-auto mt-20 max-w-md">
      <div className="card">
        <h1 className="text-xl text-gray-900 mb-1">Sign in to QA Tools</h1>
        <p className="text-sm text-gray-500 mb-6">
          Paste a JWT minted by the QA Tools Worker.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="token"
              className="block text-xs font-medium text-gray-700 mb-1"
            >
              JWT Token
            </label>
            <textarea
              id="token"
              value={token}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs font-mono
                         text-gray-900 placeholder-gray-400 shadow-sm
                         focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500
                         resize-none h-24"
            />
          </div>

          {error && (
            <p className="text-xs text-red-600 rounded-md bg-red-50 border border-red-200 px-3 py-2">
              {error}
            </p>
          )}

          <button type="submit" className="btn-primary w-full justify-center">
            Sign in
          </button>
        </form>

        <div className="mt-6 border-t border-gray-100 pt-4">
          <p className="text-xs text-gray-400">
            <strong>Get a token:</strong> run the following against the worker:
          </p>
          <pre className="mt-2 rounded-md bg-gray-900 text-green-400 text-xs p-3 overflow-x-auto">
{`curl -X POST https://qa-tools.adrper79.workers.dev/auth/token \\
  -H "Content-Type: application/json" \\
  -d '{"secret":"<QA_TOOLS_JWT_SECRET>",
       "claims":{"sub":"dev","role":"qa_admin",
                 "app_ids":null,"exp":9999999999}}'`}
          </pre>
        </div>
      </div>
    </div>
  );
}

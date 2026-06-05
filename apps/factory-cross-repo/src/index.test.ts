/**
 * Tests for factory-cross-repo.
 *
 * Covers health, authorization, and payload validation
 */

import { describe, it, expect, vi } from 'vitest';
import app, { type Env } from './index.js';

const TEST_TOKEN = 'test-bearer-token-12345';

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    FACTORY_CROSS_REPO_TOKEN: TEST_TOKEN,
    FACTORY_APP_ID: '12345',
    FACTORY_APP_PRIVATE_KEY: `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA0Z3VS5JJcds9cXdCUlVGn/OPIUAE/GKYp8yKhKNzCz8VVHVD
dBzPJoFM8J9bPnJRyPAZuJdXzLwBqCiZfEpP6D8GqSFOQ7Z3kpFzFbNjLzN5A7Wo
-----END RSA PRIVATE KEY-----`,
    FACTORY_APP_INSTALLATION_ID: '54321',
    ...overrides,
  };
}

describe('factory-cross-repo', () => {
  describe('health endpoint', () => {
    it('returns health status', async () => {
      const res = await app.request('/health', {}, makeEnv());
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.ok).toBe(true);
      expect(body.service).toBe('factory-cross-repo');
      expect(body.ts).toBeDefined();
    });
  });

  describe('POST /api/supervisor/create-pr', () => {
    describe('authentication', () => {
      it('rejects requests without Authorization header', async () => {
        const res = await app.request('/api/supervisor/create-pr', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            template_id: 'test',
            run_id: 'run-123',
            affected_repos: [{ owner: 'test', repo: 'test', app_id: 'app-1' }],
          }),
        }, makeEnv());
        expect(res.status).toBe(401);
        const body = (await res.json()) as Record<string, unknown>;
        expect(body.ok).toBe(false);
        expect(body.error).toBe('Unauthorized');
      });

      it('rejects requests with incorrect bearer token', async () => {
        const res = await app.request('/api/supervisor/create-pr', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'authorization': '******',
          },
          body: JSON.stringify({
            template_id: 'test',
            run_id: 'run-123',
            affected_repos: [{ owner: 'test', repo: 'test', app_id: 'app-1' }],
          }),
        }, makeEnv());
        expect(res.status).toBe(401);
        const body = (await res.json()) as Record<string, unknown>;
        expect(body.ok).toBe(false);
      });
    });

    describe('payload validation', () => {
      const auth = { 'authorization': 'Bearer ' + TEST_TOKEN };

      it('rejects malformed JSON', async () => {
        const res = await app.request('/api/supervisor/create-pr', {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...auth },
          body: '{bad json',
        }, makeEnv());
        expect(res.status).toBe(400);
        const body = (await res.json()) as Record<string, unknown>;
        expect(body.ok).toBe(false);
        expect(body.error).toBe('Invalid JSON body');
      });

      it('rejects payload missing template_id', async () => {
        const res = await app.request('/api/supervisor/create-pr', {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...auth },
          body: JSON.stringify({
            run_id: 'run-123',
            affected_repos: [{ owner: 'test', repo: 'test', app_id: 'app-1' }],
          }),
        }, makeEnv());
        expect(res.status).toBe(400);
        const body = (await res.json()) as Record<string, unknown>;
        expect(body.error).toContain('Missing required fields');
      });

      it('rejects payload missing run_id', async () => {
        const res = await app.request('/api/supervisor/create-pr', {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...auth },
          body: JSON.stringify({
            template_id: 'test',
            affected_repos: [{ owner: 'test', repo: 'test', app_id: 'app-1' }],
          }),
        }, makeEnv());
        expect(res.status).toBe(400);
        const body = (await res.json()) as Record<string, unknown>;
        expect(body.error).toContain('Missing required fields');
      });

      it('rejects payload with empty affected_repos', async () => {
        const res = await app.request('/api/supervisor/create-pr', {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...auth },
          body: JSON.stringify({
            template_id: 'test',
            run_id: 'run-123',
            affected_repos: [],
          }),
        }, makeEnv());
        expect(res.status).toBe(400);
        const body = (await res.json()) as Record<string, unknown>;
        expect(body.error).toContain('Missing required fields');
      });

      it('rejects payload when affected_repos is not an array', async () => {
        const res = await app.request('/api/supervisor/create-pr', {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...auth },
          body: JSON.stringify({
            template_id: 'test',
            run_id: 'run-123',
            affected_repos: 'not-an-array',
          }),
        }, makeEnv());
        expect(res.status).toBe(400);
        const body = (await res.json()) as Record<string, unknown>;
        expect(body.error).toContain('Missing required fields');
      });
    });
  });

  describe('404 fallback', () => {
    it('returns 404 for unknown routes', async () => {
      const res = await app.request('/unknown-route', {}, makeEnv());
      expect(res.status).toBe(404);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Not found');
    });
  });
});

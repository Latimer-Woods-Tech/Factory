import { describe, it, expect } from 'vitest';
import { isAllowedAudience, signScopedToken, verifyScopedToken } from '../src/jwt.js';

const SECRET = 'test-root-signing-key-0123456789';

const baseClaims = {
  iss: 'factory-core-api',
  sub: 'repo:Latimer-Woods-Tech/factory:ref:refs/heads/main',
  aud: 'gates-ci',
  repository: 'Latimer-Woods-Tech/factory',
  repository_owner: 'Latimer-Woods-Tech',
};

describe('isAllowedAudience', () => {
  it.each(['gates-ci', 'gates-canary', 'artifacts-video', 'audit-humandesign', 'runs-mirror'])(
    'accepts known ingestion scope %s',
    (audience) => {
      expect(isAllowedAudience(audience)).toBe(true);
    },
  );

  it.each(['', 'admin', 'gates_ci', 'GATES-ci', 'gates-', 'deploy-prod', 'gatesci'])(
    'rejects disallowed scope %s',
    (audience) => {
      expect(isAllowedAudience(audience)).toBe(false);
    },
  );
});

describe('signScopedToken / verifyScopedToken', () => {
  it('round-trips claims and sets iat/exp', async () => {
    const { token, expiresIn, claims } = await signScopedToken(baseClaims, SECRET, 600);
    expect(expiresIn).toBe(600);
    expect(claims.exp - claims.iat).toBe(600);

    const verified = await verifyScopedToken(token, SECRET);
    expect(verified.aud).toBe('gates-ci');
    expect(verified.sub).toBe(baseClaims.sub);
    expect(verified.repository_owner).toBe('Latimer-Woods-Tech');
  });

  it('rejects a token signed with a different secret', async () => {
    const { token } = await signScopedToken(baseClaims, SECRET, 600);
    await expect(verifyScopedToken(token, 'a-different-secret')).rejects.toThrow(/signature/i);
  });

  it('rejects a tampered payload', async () => {
    const { token } = await signScopedToken(baseClaims, SECRET, 600);
    const [header, , signature] = token.split('.');
    const forged = `${header}.${btoa('{"aud":"gates-admin"}').replaceAll('=', '')}.${signature}`;
    await expect(verifyScopedToken(forged, SECRET)).rejects.toThrow(/signature/i);
  });

  it('rejects an expired token', async () => {
    const { token } = await signScopedToken(baseClaims, SECRET, -1);
    await expect(verifyScopedToken(token, SECRET)).rejects.toThrow(/expired/i);
  });

  it('rejects a malformed token', async () => {
    await expect(verifyScopedToken('not.a.jwt.token', SECRET)).rejects.toThrow(/malformed/i);
    await expect(verifyScopedToken('onlyonepart', SECRET)).rejects.toThrow(/malformed/i);
  });
});

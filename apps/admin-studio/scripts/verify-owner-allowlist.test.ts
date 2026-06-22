import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const scriptPath = fileURLToPath(new URL('./verify-owner-allowlist.mjs', import.meta.url));

describe('production owner allowlist guard', () => {
  it('accepts the three required owners', () => {
    const output = execFileSync(process.execPath, [scriptPath], {
      encoding: 'utf8',
      env: {
        ...process.env,
        STUDIO_ALLOWED_USERS_JSON: JSON.stringify({
          'adrper79@gmail.com': { role: 'owner', allowExternal: true },
          'aperry@latwoodtech.com': { role: 'owner' },
          'blackkryptonians@gmail.com': { role: 'owner', allowExternal: true },
        }),
      },
    });

    expect(output).toContain('Verified 3 required production owners');
  });

  it('rejects an allowlist with a missing required owner', () => {
    expect(() => execFileSync(process.execPath, [scriptPath], {
      stdio: 'pipe',
      env: {
        ...process.env,
        STUDIO_ALLOWED_USERS_JSON: JSON.stringify({
          'adrper79@gmail.com': { role: 'owner', allowExternal: true },
          'aperry@latwoodtech.com': { role: 'owner' },
        }),
      },
    })).toThrow();
  });

  it('rejects an external owner without explicit external-account permission', () => {
    expect(() => execFileSync(process.execPath, [scriptPath], {
      stdio: 'pipe',
      env: {
        ...process.env,
        STUDIO_ALLOWED_USERS_JSON: JSON.stringify({
          'adrper79@gmail.com': { role: 'owner' },
          'aperry@latwoodtech.com': { role: 'owner' },
          'blackkryptonians@gmail.com': { role: 'owner', allowExternal: true },
        }),
      },
    })).toThrow();
  });
});

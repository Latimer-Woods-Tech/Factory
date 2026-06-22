import { describe, expect, it } from 'vitest';
import { getGoogleWorkspaceDomainError } from './auth.js';

describe('Google Workspace domain policy', () => {
  it('allows Google identities from the configured Workspace hosted domain', () => {
    expect(
      getGoogleWorkspaceDomainError(
        { email: 'adrian@latwoodtech.com', hostedDomain: 'latwoodtech.com' },
        'latwoodtech.com',
      ),
    ).toBeNull();
  });

  it('rejects Google identities without the configured Workspace hosted domain claim', () => {
    expect(
      getGoogleWorkspaceDomainError(
        { email: 'adrian@gmail.com', hostedDomain: null },
        'latwoodtech.com',
      ),
    ).toBe("Google account 'adrian@gmail.com' is not a member of the required Workspace domain 'latwoodtech.com'");
  });

  it('allows an explicitly allowlisted Google identity outside the Workspace domain', () => {
    expect(
      getGoogleWorkspaceDomainError(
        { email: 'adrper79@gmail.com', hostedDomain: null },
        'latwoodtech.com',
        true,
      ),
    ).toBeNull();
  });

  it('rejects Google identities from a different Workspace hosted domain', () => {
    expect(
      getGoogleWorkspaceDomainError(
        { email: 'adrian@apunlimited.com', hostedDomain: 'apunlimited.com' },
        'latwoodtech.com',
      ),
    ).toBe("Google account 'adrian@apunlimited.com' is not a member of the required Workspace domain 'latwoodtech.com'");
  });

  it('is disabled when no Workspace domain is configured', () => {
    expect(
      getGoogleWorkspaceDomainError(
        { email: 'adrian@gmail.com', hostedDomain: null },
        '',
      ),
    ).toBeNull();
  });
});

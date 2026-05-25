// @vitest-environment node
//
// Unit tests for the proof-gate validation logic used by the
// /capabilities/provision-staging route. Persistence paths aren't exercised
// here because they require a live Hyperdrive binding — the store also
// already swallows DB errors as best-effort.

import { describe, expect, it } from 'vitest';
import { REQUIRED_PROOF_GATES, validateProofGates } from '../src/lib/handoff-store';

describe('validateProofGates', () => {
  it('rejects an empty proof-gate object', () => {
    const result = validateProofGates(undefined);
    expect(result.valid).toBe(false);
    expect(result.missing).toEqual(REQUIRED_PROOF_GATES);
    expect(result.normalized).toEqual({
      reviewedPlan: false,
      reviewedEnvContract: false,
      reviewedSmokeChecks: false,
      acknowledgedStagingFirst: false,
      acknowledgedCustomDomain: false,
    });
  });

  it('lists exactly the missing gates', () => {
    const result = validateProofGates({
      reviewedPlan: true,
      reviewedEnvContract: true,
      reviewedSmokeChecks: false,
      acknowledgedStagingFirst: true,
      acknowledgedCustomDomain: false,
    });
    expect(result.valid).toBe(false);
    expect(result.missing).toEqual(['reviewedSmokeChecks', 'acknowledgedCustomDomain']);
  });

  it('accepts when every required gate is true', () => {
    const result = validateProofGates({
      reviewedPlan: true,
      reviewedEnvContract: true,
      reviewedSmokeChecks: true,
      acknowledgedStagingFirst: true,
      acknowledgedCustomDomain: true,
    });
    expect(result.valid).toBe(true);
    expect(result.missing).toEqual([]);
  });
});

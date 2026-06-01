// @vitest-environment node
//
// Hash helper unit tests. Validates deterministic canonical serialization and
// the SHA-256 hex digest contract that the handoff route relies on for
// content-addressing.

import { describe, expect, it } from 'vitest';
import { canonicalJson, hashHandoffBody, sha256Hex } from '../src/lib/handoff-hash';

describe('canonicalJson', () => {
  it('sorts object keys lexicographically at every depth', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(canonicalJson({ a: { z: 1, y: 2 }, b: 3 })).toBe('{"a":{"y":2,"z":1},"b":3}');
  });

  it('omits undefined values and preserves null', () => {
    expect(canonicalJson({ a: undefined, b: null })).toBe('{"b":null}');
  });

  it('serializes arrays in order and recurses into elements', () => {
    expect(canonicalJson([{ b: 1, a: 2 }, { d: 3, c: 4 }])).toBe('[{"a":2,"b":1},{"c":4,"d":3}]');
  });
});

describe('sha256Hex', () => {
  it('produces the canonical SHA-256 hex digest', async () => {
    const hash = await sha256Hex('hello');
    expect(hash).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
    expect(hash).toHaveLength(64);
  });
});

describe('hashHandoffBody', () => {
  it('returns the same hash for structurally identical bodies', async () => {
    const a = await hashHandoffBody({ a: 1, b: { c: 2, d: 3 } });
    const b = await hashHandoffBody({ b: { d: 3, c: 2 }, a: 1 });
    expect(a).toBe(b);
  });

  it('returns a different hash when any value changes', async () => {
    const a = await hashHandoffBody({ a: 1, b: 2 });
    const b = await hashHandoffBody({ a: 1, b: 3 });
    expect(a).not.toBe(b);
  });
});

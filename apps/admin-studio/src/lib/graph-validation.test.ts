import { describe, expect, it } from 'vitest';
import {
  parseGraphCreateInput,
  parseGraphPatchInput,
} from './graph-validation.js';

describe('graph validation', () => {
  it('accepts a valid graph patch with expectedVersion', () => {
    const result = parseGraphPatchInput({
      expectedVersion: 3,
      nodes: [
        {
          id: 'concept-1',
          nodeType: 'concept',
          ref: 'outbound-dialer',
          position: { x: 120, y: 240 },
          params: { seats: 2, enabled: true },
        },
      ],
      edges: [],
    });

    expect(result).toEqual({
      ok: true,
      value: {
        expectedVersion: 3,
        nodes: [
          {
            id: 'concept-1',
            nodeType: 'concept',
            ref: 'outbound-dialer',
            position: { x: 120, y: 240 },
            params: { seats: 2, enabled: true },
          },
        ],
        edges: [],
      },
    });
  });

  it('rejects malformed nodes and dangling edges', () => {
    const result = parseGraphPatchInput({
      nodes: [
        {
          id: 'shared-id',
          nodeType: 'concept',
          ref: 'outbound-dialer',
          position: { x: 10, y: 20 },
        },
        {
          id: 'shared-id',
          nodeType: 'primitive',
          ref: 'auth',
          position: { x: Number.NaN, y: 30 },
          params: { nested: { nope: true } },
        },
      ],
      edges: [
        {
          id: 'edge-1',
          sourceNodeId: 'shared-id',
          targetNodeId: 'missing-node',
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        field: 'nodes[1].id',
        message: 'duplicate node id "shared-id"',
      }),
      expect.objectContaining({
        field: 'nodes[1].position.x',
        message: 'must be a finite number',
      }),
      expect.objectContaining({
        field: 'nodes[1].params.nested',
        message: 'param values must be string, finite number, or boolean',
      }),
      expect.objectContaining({
        field: 'edges[0].targetNodeId',
        message: 'target node "missing-node" does not exist in nodes',
      }),
    ]));
  });

  it('rejects create payloads without a non-empty name', () => {
    const result = parseGraphCreateInput({ name: '   ' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toEqual([
      { field: 'name', message: 'must not be empty' },
    ]);
  });
});

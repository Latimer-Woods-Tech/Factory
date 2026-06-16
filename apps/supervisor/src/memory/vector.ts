/**
 * RFC-007 Phase 0: vector memory helpers for the supervisor.
 *
 * Two exported functions, both never-throw (same contract as writeMemory in d1.ts):
 *   embedAndUpsert — embed text and upsert into a Vectorize index
 *   queryNearest   — embed a query and return the k nearest vectors (time-budgeted)
 *
 * All embedding goes through @latimer-woods-tech/llm embed() — never env.AI directly.
 * Reads are time-budgeted (~200ms hard cap) so the slow lane never stalls the fast lane.
 */

import { embed, type AiBinding } from '@latimer-woods-tech/llm';

/** Metadata stored alongside each vector in Vectorize. */
export interface VectorMetadata {
  [key: string]: string | number | boolean;
}

export interface NearestResult {
  id: string;
  score: number;
  metadata?: VectorMetadata;
}

/** Minimal Vectorize index binding shape needed here. */
interface VectorizeIndex {
  upsert(vectors: Array<{ id: string; values: number[]; metadata?: Record<string, string | number | boolean> }>): Promise<unknown>;
  query(
    vector: number[],
    opts: { topK: number; returnMetadata?: 'all' | 'none' | 'indexed' },
  ): Promise<{ matches: Array<{ id: string; score: number; metadata?: Record<string, string | number | boolean> }> }>;
}

const QUERY_TIMEOUT_MS = 200;

/**
 * Embeds `text` via the Workers AI binding and upserts into the given Vectorize index.
 *
 * Never throws — errors are swallowed and false is returned so callers can treat
 * this as best-effort without wrapping every call site.
 */
export async function embedAndUpsert(
  ai: AiBinding,
  index: VectorizeIndex,
  id: string,
  text: string,
  metadata?: VectorMetadata,
): Promise<boolean> {
  try {
    const { vectors } = await embed(ai, text);
    await index.upsert([{ id, values: vectors[0]!, metadata }]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Embeds `query` and returns the k nearest vectors from the given Vectorize index.
 *
 * Time-budgeted: aborts after QUERY_TIMEOUT_MS and returns [] so the fast lane
 * is never stalled by a slow AI/Vectorize call.
 *
 * Never throws.
 */
export async function queryNearest(
  ai: AiBinding,
  index: VectorizeIndex,
  query: string,
  topK = 5,
): Promise<NearestResult[]> {
  try {
    const timeoutPromise = new Promise<NearestResult[]>((resolve) => {
      setTimeout(() => resolve([]), QUERY_TIMEOUT_MS);
    });

    const queryPromise = (async (): Promise<NearestResult[]> => {
      const { vectors } = await embed(ai, query);
      const result = await index.query(vectors[0]!, { topK, returnMetadata: 'all' });
      return result.matches.map((m) => ({
        id: m.id,
        score: m.score,
        metadata: m.metadata as VectorMetadata | undefined,
      }));
    })();

    return await Promise.race([queryPromise, timeoutPromise]);
  } catch {
    return [];
  }
}

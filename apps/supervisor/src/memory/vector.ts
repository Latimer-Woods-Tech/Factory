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

// embed() and AiBinding are not yet exported from the published @latimer-woods-tech/llm
// package (RFC-007 Phase 0 debt). Using env.AI directly via `any` until the package
// ships the embed export. All call sites already guard env.AI for undefined.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AiBinding = any;

/** Metadata stored alongside each vector in Vectorize. */
export interface VectorMetadata {
  [key: string]: string | number | boolean;
}

export interface NearestResult {
  id: string;
  score: number;
  metadata?: VectorMetadata;
}

/** Minimal Vectorize index binding shape needed here.
 * Uses Record<string, unknown> for metadata so the official CF VectorizeIndex
 * type (which uses VectorizeVectorMetadata, a wider union) is structurally assignable. */
interface VectorizeIndex {
  upsert(vectors: Array<{ id: string; values: number[]; metadata?: Record<string, unknown> }>): Promise<unknown>;
  query(
    vector: number[],
    opts: { topK: number; returnMetadata?: 'all' | 'none' | 'indexed' },
  ): Promise<{ matches: Array<{ id: string; score: number; metadata?: Record<string, unknown> }> }>;
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AI binding type is not exported from @latimer-woods-tech/llm yet (RFC-007 Phase 0 debt)
    const result = await (ai as any).run('@cf/baai/bge-base-en-v1.5', { text: [text] }) as { data: number[][] };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- same as above; VectorizeVectorMetadata incompatibility resolved once llm pkg ships typed embed()
    await (index as any).upsert([{ id, values: result.data[0]!, metadata }]);
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AI binding type not yet exported from @latimer-woods-tech/llm
      const embedResult = await (ai as any).run('@cf/baai/bge-base-en-v1.5', { text: [query] }) as { data: number[][] };
      const vectors = embedResult.data;
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

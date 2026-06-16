/**
 * Workers AI embedding API.
 *
 * Pins to bge-base-en-v1.5 (768-dim cosine) — the platform standard.
 * model_version is returned with every result so callers can record it
 * for provenance-aware re-embed when the model is swapped.
 *
 * Contract: inject the Workers AI binding (env.AI) — never import a vendor SDK.
 */

export const DEFAULT_EMBEDDING_MODEL = '@cf/baai/bge-base-en-v1.5';

export type EmbeddingModel = '@cf/baai/bge-base-en-v1.5';

export interface EmbedResult {
  vectors: number[][];
  model: string;
  dims: number;
}

/** Minimal Workers AI binding shape needed for embeddings. */
export interface AiBinding {
  run(
    model: string,
    inputs: { text: string | string[] },
  ): Promise<{ data: number[][] }>;
}

/**
 * Embeds one or more text strings using the Workers AI binding.
 *
 * @param ai    - Workers AI binding (`env.AI`) — injected, not imported.
 * @param input - Single string or array of strings to embed.
 * @param opts  - Optional model override (must be a supported EmbeddingModel).
 * @returns Embedding vectors, model name, and dimension count.
 *
 * @throws When the AI binding call fails (let the caller decide whether to catch).
 */
export async function embed(
  ai: AiBinding,
  input: string | string[],
  opts?: { model?: EmbeddingModel },
): Promise<EmbedResult> {
  const model = opts?.model ?? DEFAULT_EMBEDDING_MODEL;
  const texts = Array.isArray(input) ? input : [input];
  const result = await ai.run(model, { text: texts });
  const vectors = result.data;
  if (!vectors || vectors.length === 0) {
    throw new Error(`embed(): Workers AI returned no vectors for model ${model}`);
  }
  return {
    vectors,
    model,
    dims: vectors[0]!.length,
  };
}

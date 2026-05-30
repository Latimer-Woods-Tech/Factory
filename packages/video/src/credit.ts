// ---------------------------------------------------------------------------
// Energy Blueprint Video Engine — credit cost policy + costFn
// (I1 Slice 0, doc §7 + decisions D4/D13)
//
// `costFn` is the canonical, pure cost math for a render. The credit *ledger*
// (balances, txns, grants over time) lives in the selfprime billing domain;
// this module only computes "how many credits does this spec cost" from an
// operator-tunable {@link CreditPolicy}. No DB, no I/O, fully deterministic.
// ---------------------------------------------------------------------------

import type {
  CompositionSpec,
  VideoFormat,
  VideoSource,
} from './engine-types.js';

/**
 * Operator-tunable credit policy (doc §4, D13). Every value is config-driven so
 * the operator can retune from real cost-per-film telemetry without a redeploy.
 *
 * selfprime supplies its own concrete policy and persists the ledger; Factory
 * only owns the shape and the {@link costFn} math.
 */
export interface CreditPolicy {
  /** Flat base cost applied to every render. */
  base: number;
  /** Additive per-source cost, keyed by {@link VideoSource}. */
  perSource: Record<VideoSource, number>;
  /**
   * Additive per-format term, keyed by {@link VideoFormat}. The doc writes the
   * format component additively (`+ formatMultiplier(format)`), so it is a flat
   * additive term here, not a multiplier.
   */
  formatTerm: Record<VideoFormat, number>;
  /** Monthly credit grant by tier id. */
  tierGrants: Record<string, number>;
  /**
   * Maximum credits that may roll over, keyed by tier id (≈ one month's grant
   * per tier). Per-tier so a higher tier's larger grant is not capped to a
   * lower tier's carryover; a tier absent from this map carries over nothing.
   */
  rolloverCap: Record<string, number>;
}

/**
 * Pure cost function: maps a composition's sources + format to an integer
 * credit count under a given {@link CreditPolicy}.
 */
export type CostFn = (
  spec: Pick<CompositionSpec, 'sources' | 'format'>,
  policy: CreditPolicy,
) => number;

/**
 * Computes the credit cost of a render (doc §7, D4/D13):
 *
 * ```text
 * cost = policy.base
 *      + Σ policy.perSource[source]  (for each source in spec.sources)
 *      + policy.formatTerm[spec.format]
 * ```
 *
 * The result is rounded to an integer credit count via `Math.round`. All terms
 * are operator-tunable config (D13); a missing per-source or format entry
 * contributes `0` so an unpriced source/format never throws (callers should
 * still keep the policy complete). Pure and deterministic — no DB, no I/O.
 *
 * @example
 * ```ts
 * const cost = costFn(
 *   { sources: ['blueprint', 'transits'], format: 'full_film' },
 *   policy,
 * );
 * ```
 */
export const costFn: CostFn = (spec, policy) => {
  let total = policy.base;
  for (const source of spec.sources) {
    total += policy.perSource[source] ?? 0;
  }
  total += policy.formatTerm[spec.format] ?? 0;
  return Math.round(total);
};

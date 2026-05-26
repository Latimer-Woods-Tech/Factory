/**
 * Expected-gate checks bundled from docs/observability/expected-gates.yml.
 *
 * The YAML file is the human-editable source of truth; this TypeScript
 * constant is the runtime copy. Keep them in sync when adding/removing checks.
 */
export interface ExpectedGateCheck {
  /** Gate type expected to appear in factory_gates_latest. */
  gateType: string;
  /** Grace period: how long a run may stay 'running' without this gate. */
  graceMs: number;
  /** Short description included in stuck-detection evidence_summary. */
  description: string;
}

export const EXPECTED_GATE_CHECKS: readonly ExpectedGateCheck[] = [
  {
    gateType: 'constraints',
    graceMs: 15 * 60 * 1000,
    description: 'Constraints check gate expected within 15 min of run start',
  },
  {
    gateType: 'ci',
    graceMs: 30 * 60 * 1000,
    description: 'CI gate expected within 30 min of run start',
  },
  {
    gateType: 'verifier',
    graceMs: 60 * 60 * 1000,
    description: 'Verifier gate expected within 60 min of run start',
  },
] as const;

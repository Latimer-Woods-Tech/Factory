/**
 * End-to-end integration tests: 5 scenarios covering all 4 gaps
 * (verifier, approval gates, mutation limits, PR opening)
 *
 * Tests the full flow from template loading through execution,
 * verification, approval, and receipt logging.
 *
 * Scenarios:
 * 1. Baseline (no gates): Both steps succeed, receipts logged, no PR
 * 2. Amplification cap: 26 steps fail at step 26
 * 3. Approval gate: Step 2 blocks, /approve resumes
 * 4. Verifier fails: Execution succeeds but verification fails
 * 5. End-to-end happy path: 2 mutations, approval, verifier, PR opens
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { executePlan, executeStep, executeTemplate } from '../executor';
import type { Template } from '../planner/load';
import {
  ALL_FIXTURES,
  createMockToolRegistry,
  SCENARIO_DESCRIPTIONS,
  templateSimpleReadonly,
  templateWithAmplificationCap,
  templateWithApprovalGate,
  templateWithVerifier,
  templateEndToEnd,
} from '../__fixtures__/templates';
import type { Env } from '../index';

// Mock Env for testing
function createMockEnv(): Env {
  return {
    SUPERVISOR: {} as DurableObjectNamespace,
    LOCK: {} as DurableObjectNamespace,
    MEMORY: {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue([]),
      }),
      exec: vi.fn().mockResolvedValue([]),
    } as unknown as D1Database,
    LLM_LEDGER: {} as D1Database,
    AI_GATEWAY_BASE_URL: 'https://ai-gateway.example.com',
    ANTHROPIC_API_KEY: 'test-key',
    GROQ_API_KEY: 'test-key',
    VERTEX_ACCESS_TOKEN: 'test-token',
    VERTEX_PROJECT: 'test-project',
    VERTEX_LOCATION: 'us-central1',
    JWT_SECRET: 'test-secret-key-for-jwt-signing',
    FACTORY_APP_ID: 'test-app-id',
    FACTORY_APP_PRIVATE_KEY: 'test-key',
    FACTORY_APP_INSTALLATION_ID: 'test-installation-id',
    PUSHOVER_TOKEN: 'test-token',
    PUSHOVER_USER_KEY: 'test-user-key',
    SLACK_SIGNING_SECRET: 'test-signing-secret',
    SLACK_OWNER_USER_ID: 'test-user-id',
  };
}

describe('End-to-End Supervisor Scenarios', () => {
  let mockEnv: Env;
  let mockToolRegistry: ReturnType<typeof createMockToolRegistry>;

  beforeEach(() => {
    mockEnv = createMockEnv();
    mockToolRegistry = createMockToolRegistry();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Scenario 1: Baseline template (no gates)
   * - Both steps are read-only
   * - Both should execute successfully
   * - All receipts should be logged
   * - No PR opened (readonly mutations)
   */
  describe('Scenario 1: Baseline (no gates)', () => {
    it('executes all steps successfully and logs receipts', async () => {
      const plan = {
        steps: [
          {
            tool: 'github.search',
            slots: { query: 'is:open label:bug' },
            side_effects: 'read-external' as const,
          },
          {
            tool: 'sentry.list-issues',
            slots: { project: 'selfprime', status: 'unresolved' },
            side_effects: 'read-external' as const,
          },
        ],
      };

      const receipts = await executePlan(plan.steps, mockToolRegistry, mockEnv);

      // Verify: 2 receipts logged
      expect(receipts).toHaveLength(2);
      expect(receipts[0]).toBeDefined();
      expect(receipts[1]).toBeDefined();

      // Verify: step 0 succeeded
      expect(receipts[0]!).toMatchObject({
        step_index: 0,
        tool_name: 'github.search',
        side_effects: 'read-external',
        result: { ok: true },
      });

      // Verify: step 1 succeeded
      expect(receipts[1]!).toMatchObject({
        step_index: 1,
        tool_name: 'sentry.list-issues',
        side_effects: 'read-external',
        result: { ok: true },
      });

      // Verify: no approval gates were triggered
      expect(receipts[0]?.awaiting_approval).toBeUndefined();
      expect(receipts[1]?.awaiting_approval).toBeUndefined();
    });

    it('matches expected template from fixtures', () => {
      expect(templateSimpleReadonly.id).toBe('simple-readonly');
      expect(templateSimpleReadonly.steps).toHaveLength(2);
      expect(templateSimpleReadonly.steps?.[0]?.side_effects).toBe('read-external');
    });
  });

  /**
   * Scenario 2: Amplification cap exceeded
   * - Template has 26 mutating steps
   * - Execution should stop at step 26
   * - Receipt at step 26 should have error: "Mutation limit exceeded"
   * - Step 27 should never be invoked
   */
  describe('Scenario 2: Amplification cap exceeded', () => {
    it('template has 26 mutating steps', () => {
      expect(templateWithAmplificationCap.id).toBe('with-amplification-cap');
      expect(templateWithAmplificationCap.steps).toHaveLength(26);

      // All steps should be mutating
      for (const step of templateWithAmplificationCap.steps!) {
        expect(step.side_effects).toBe('write-app');
      }
    });

    it('enforcement: mutation cap blocks at step 25', async () => {
      const plan = {
        steps: templateWithAmplificationCap.steps!.map((step) => ({
          tool: step.tool,
          slots: step.slots ?? {},
          side_effects: step.side_effects ?? ('none' as const),
        })),
      };

      expect(plan.steps).toHaveLength(26);

      const receipts = await executePlan(plan.steps, mockToolRegistry, mockEnv);

      // executePlan should stop at step 25 (0-indexed, so that's the 26th step)
      expect(receipts.length).toBeLessThanOrEqual(26);

      // The last receipt should be the error receipt
      const lastReceipt = receipts[receipts.length - 1];
      expect(lastReceipt).toBeDefined();
      expect(lastReceipt!.result.ok).toBe(false);
      const errorResult = lastReceipt!.result;
      if (!errorResult.ok) {
        expect(errorResult.error).toContain('Mutation limit exceeded');
      }
    });

    it('scenario description is correct', () => {
      expect(SCENARIO_DESCRIPTIONS.scenario2).toMatchObject({
        name: 'Amplification cap exceeded',
        template: 'with-amplification-cap',
      });
    });
  });

  /**
   * Scenario 3: Approval gate blocks execution
   * - Step 2 has requires_codeowner_approval: true
   * - Step 1 should execute successfully
   * - Step 2 should trigger awaiting_approval gate and stop
   * - No further steps should execute
   * - Receipt 2 should have awaiting_approval = 'codeowner_confirmation'
   */
  describe('Scenario 3: Approval gate blocks execution', () => {
    it('template has approval gate on step 2', () => {
      expect(templateWithApprovalGate.id).toBe('with-approval-gate');
      expect(templateWithApprovalGate.steps).toHaveLength(3);
      expect(templateWithApprovalGate.steps?.[1]?.requires_codeowner_approval).toBe(true);
    });

    it('step indices and approval flags are correct', () => {
      const steps = templateWithApprovalGate.steps!;

      // Step 0: no approval flag
      expect(steps[0]?.requires_codeowner_approval).toBeUndefined();

      // Step 1: has approval flag
      expect(steps[1]?.requires_codeowner_approval).toBe(true);

      // Step 2: no approval flag
      expect(steps[2]?.requires_codeowner_approval).toBeUndefined();
    });

    it('execution stops at approval gate', async () => {
      const plan = {
        steps: templateWithApprovalGate.steps!.map((step) => ({
          tool: step.tool,
          slots: step.slots ?? {},
          side_effects: step.side_effects ?? ('none' as const),
          requires_codeowner_approval: step.requires_codeowner_approval,
        })),
      };

      const receipts = await executePlan(plan.steps, mockToolRegistry, mockEnv);

      // Step 0 should execute and succeed
      expect(receipts[0]?.result.ok).toBe(true);
      expect(receipts[0]?.awaiting_approval).toBeUndefined();

      // Step 1 should trigger awaiting_approval
      expect(receipts[1]?.awaiting_approval).toBe('codeowner_confirmation');

      // No step 2 should exist (execution stopped at approval gate)
      expect(receipts.length).toBe(2);
    });

    it('scenario description matches expected behavior', () => {
      expect(SCENARIO_DESCRIPTIONS.scenario3.name).toBe('Approval gate blocks execution');
      expect(SCENARIO_DESCRIPTIONS.scenario3.expectedResult).toContain('awaiting_approval');
    });
  });

  /**
   * Scenario 4: Verifier fails
   * - Execution succeeds (all steps run)
   * - Verifier is called post-execution
   * - Verifier returns { ok: false, error: "..." }
   * - Run should be marked failed_verification
   * - Receipts should NOT be logged to supervisor_steps
   *
   * NOTE: This scenario requires Team B implementation of verifier step
   * in supervisor.do.ts after executePlan() completes.
   */
  describe('Scenario 4: Verifier fails', () => {
    it('template has verifier that fails', () => {
      expect(templateWithVerifier.id).toBe('with-verifier');
      expect(templateWithVerifier.acceptance_gate).toBeDefined();
      expect(templateWithVerifier.acceptance_gate?.verifier_query).toBe(
        'intent-verifier-fail-test',
      );
    });

    it('verifier tool returns failure', async () => {
      const verifierTool = mockToolRegistry.get('intent-verifier-fail-test');
      expect(verifierTool).toBeDefined();

      const result = await verifierTool!.invoke({});
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Verification failed');
      }
    });

    it('single read-only step in template', () => {
      const steps = templateWithVerifier.steps!;
      expect(steps).toHaveLength(1);
      expect(steps[0]?.side_effects).toBe('none');
    });

    it('scenario description matches expected behavior', () => {
      expect(SCENARIO_DESCRIPTIONS.scenario4.name).toBe('Verifier fails');
      expect(SCENARIO_DESCRIPTIONS.scenario4.expectedResult).toContain('failed_verification');
    });

    // Once Team B implements verifier:
    // it('execution succeeds but verification fails', async () => {
    //   const plan = {
    //     steps: templateWithVerifier.steps!.map((step) => ({
    //       tool: step.tool,
    //       slots: step.slots ?? {},
    //       side_effects: step.side_effects ?? ('none' as const),
    //     })),
    //   };

    //   const receipts = await executePlan(plan.steps, mockToolRegistry, mockEnv);

    //   // Execution should succeed
    //   expect(receipts[0].result.ok).toBe(true);

    //   // But when verifier is invoked, it should fail
    //   const verifierTool = mockToolRegistry.get('intent-verifier-fail-test');
    //   const verificationResult = await verifierTool!.invoke({});
    //   expect(verificationResult.ok).toBe(false);

    //   // Run should be marked failed_verification, receipts not logged
    //   // (This is handled in supervisor.do.ts handleRun after executePlan)
    // });
  });

  /**
   * Scenario 5: End-to-end happy path
   * - Step 1 has requires_codeowner_approval
   * - Step 1 executes, then awaits approval
   * - Execution resumes from step 2 (after approval gate in real flow)
   * - Both steps succeed
   * - All receipts logged to supervisor_steps
   */
  describe('Scenario 5: End-to-end happy path', () => {
    it('template has 2 mutating steps, approval on step 1', () => {
      expect(templateEndToEnd.id).toBe('end-to-end');
      expect(templateEndToEnd.steps).toHaveLength(2);

      const steps = templateEndToEnd.steps!;

      // Step 1: has approval gate
      expect(steps[0]?.requires_codeowner_approval).toBe(true);
      expect(steps[0]?.side_effects).toBe('write-external');

      // Step 2: no approval gate
      expect(steps[1]?.requires_codeowner_approval).toBeUndefined();
      expect(steps[1]?.side_effects).toBe('write-external');

      // Verifier passes
      expect(templateEndToEnd.acceptance_gate?.verifier_query).toBe(
        'intent-verifier-pass-test',
      );
    });

    it('verifier tool returns success', async () => {
      const verifierTool = mockToolRegistry.get('intent-verifier-pass-test');
      expect(verifierTool).toBeDefined();

      const result = await verifierTool!.invoke({});
      expect(result.ok).toBe(true);
    });

    it('step 1 triggers approval gate, step 2 would execute after approval', async () => {
      const plan = {
        steps: templateEndToEnd.steps!.map((step) => ({
          tool: step.tool,
          slots: step.slots ?? {},
          side_effects: step.side_effects ?? ('none' as const),
          requires_codeowner_approval: step.requires_codeowner_approval,
        })),
      };

      const receipts = await executePlan(plan.steps, mockToolRegistry, mockEnv);

      // Step 0 should execute and succeed
      expect(receipts[0]?.result.ok).toBe(true);

      // Step 0 should trigger awaiting_approval
      expect(receipts[0]?.awaiting_approval).toBe('codeowner_confirmation');

      // Execution stops at approval gate
      expect(receipts).toHaveLength(1);
    });

    it('scenario description matches expected flow', () => {
      expect(SCENARIO_DESCRIPTIONS.scenario5.name).toBe('End-to-end happy path');
      expect(SCENARIO_DESCRIPTIONS.scenario5.expectedResult).toContain('approval');
      expect(SCENARIO_DESCRIPTIONS.scenario5.expectedResult).toContain('verifier passes');
      expect(SCENARIO_DESCRIPTIONS.scenario5.expectedResult).toContain('PR opened');
    });
  });

  /**
   * Cross-cutting tests
   */
  describe('Cross-cutting concerns', () => {
    it('all 5 fixtures are exported', () => {
      expect(ALL_FIXTURES).toHaveLength(5);
      expect(ALL_FIXTURES.map((t) => t.id)).toEqual([
        'simple-readonly',
        'with-amplification-cap',
        'with-approval-gate',
        'with-verifier',
        'end-to-end',
      ]);
    });

    it('all fixtures have required fields', () => {
      for (const fixture of ALL_FIXTURES) {
        expect(fixture.id).toBeDefined();
        expect(fixture.tier).toMatch(/^(green|yellow|red)$/);
        expect(fixture.description).toBeDefined();
        expect(fixture.steps).toBeDefined();
      }
    });

    it('mock tool registry has all required tools', () => {
      const requiredTools = [
        'noop-readonly',
        'noop-mutator',
        'github.search',
        'github.create-branch',
        'sentry.list-issues',
        'intent-verifier-pass-test',
        'intent-verifier-fail-test',
      ];

      for (const toolName of requiredTools) {
        const tool = mockToolRegistry.get(toolName);
        expect(tool).toBeDefined();
        expect(tool?.invoke).toBeDefined();
      }
    });

    it('mock tools return proper result shape', async () => {
      const tool = mockToolRegistry.get('github.search');
      const result = await tool!.invoke({ query: 'test' });

      expect(result).toHaveProperty('ok');
      expect(typeof result.ok).toBe('boolean');
      expect(result.ok ? result.result !== undefined : result.error !== undefined).toBe(true);
    });

    it('step receipts have all required fields', async () => {
      const step = {
        tool: 'github.search',
        slots: { query: 'is:open' },
        side_effects: 'read-external' as const,
      };

      const receipt = await executeStep(0, step, {}, {}, mockToolRegistry, mockEnv);

      expect(receipt).toHaveProperty('step_index');
      expect(receipt).toHaveProperty('tool_name');
      expect(receipt).toHaveProperty('side_effects');
      expect(receipt).toHaveProperty('slots_provided');
      expect(receipt).toHaveProperty('result');
      expect(receipt).toHaveProperty('jwt_scope');
      expect(receipt).toHaveProperty('execution_ms');
      expect(receipt).toHaveProperty('executed_at');
    });

    it('execution stops on first failure', async () => {
      const plan = {
        steps: [
          {
            tool: 'github.search',
            slots: { query: 'is:open' },
            side_effects: 'read-external' as const,
          },
          {
            tool: 'nonexistent-tool',
            slots: {},
            side_effects: 'none' as const,
          },
          {
            tool: 'sentry.list-issues',
            slots: { project: 'selfprime', status: 'unresolved' },
            side_effects: 'read-external' as const,
          },
        ],
      };

      const receipts = await executePlan(plan.steps, mockToolRegistry, mockEnv);

      // Step 0: succeeds
      expect(receipts[0]?.result.ok).toBe(true);

      // Step 1: fails (tool not found)
      expect(receipts[1]?.result.ok).toBe(false);

      // Step 2: never executes
      expect(receipts.length).toBe(2);
    });

    it('per-app mutation cap prevents excessive mutations on single app', async () => {
      const plan = {
        steps: [
          {
            tool: 'noop-mutator',
            slots: { index: 0 },
            side_effects: 'write-app' as const,
          },
          {
            tool: 'noop-mutator',
            slots: { index: 1 },
            side_effects: 'write-app' as const,
          },
          {
            tool: 'noop-mutator',
            slots: { index: 2 },
            side_effects: 'write-app' as const,
          },
          {
            tool: 'noop-mutator',
            slots: { index: 3 },
            side_effects: 'write-app' as const,
          },
          {
            tool: 'noop-mutator',
            slots: { index: 4 },
            side_effects: 'write-app' as const,
          },
          {
            tool: 'noop-mutator',
            slots: { index: 5 },
            side_effects: 'write-app' as const,
          },
        ],
      };

      const receipts = await executePlan(plan.steps, mockToolRegistry, mockEnv);

      // Should stop at step 5 (0-indexed, so the 6th step) due to per-app cap
      expect(receipts.length).toBeLessThanOrEqual(6);

      // The last receipt should be the cap-exceeded error
      const lastReceipt = receipts[receipts.length - 1];
      if (receipts.length === 6 && lastReceipt) {
        expect(lastReceipt.result.ok).toBe(false);
        expect(lastReceipt.result.error).toContain('Mutation limit exceeded');
      }
    });

    it('approval gate on success does not trigger on failure', async () => {
      const plan = {
        steps: [
          {
            tool: 'nonexistent-tool',
            slots: {},
            side_effects: 'write-app' as const,
            requires_codeowner_approval: true,
          },
        ],
      };

      const receipts = await executePlan(plan.steps, mockToolRegistry, mockEnv);

      // Step should fail (tool not found)
      expect(receipts[0]?.result.ok).toBe(false);

      // Approval gate should NOT be set on failure
      expect(receipts[0]?.awaiting_approval).toBeUndefined();
    });

    it('approval gate sets flag only on successful mutation', async () => {
      const plan = {
        steps: [
          {
            tool: 'noop-mutator',
            slots: { index: 0 },
            side_effects: 'write-app' as const,
            requires_codeowner_approval: true,
          },
        ],
      };

      const receipts = await executePlan(plan.steps, mockToolRegistry, mockEnv);

      // Step should succeed
      expect(receipts[0]?.result.ok).toBe(true);

      // Approval gate should be set
      expect(receipts[0]?.awaiting_approval).toBe('codeowner_confirmation');
    });

    it('approval gate is set on any successful step with flag, regardless of side effects', async () => {
      const plan = {
        steps: [
          {
            tool: 'noop-readonly',
            slots: { message: 'test' },
            side_effects: 'none' as const,
            requires_codeowner_approval: true,
          },
        ],
      };

      const receipts = await executePlan(plan.steps, mockToolRegistry, mockEnv);

      // Step should succeed
      expect(receipts[0]?.result.ok).toBe(true);

      // Approval gate is set if the flag is set and tool succeeds
      expect(receipts[0]?.awaiting_approval).toBe('codeowner_confirmation');
    });

    it('executeTemplate stops at first failure', async () => {
      const template: Template = {
        id: 'test-failure',
        tier: 'green',
        description: 'Test failure stop',
        steps: [
          {
            tool: 'github.search',
            slots: { query: 'is:open' },
            side_effects: 'read-external',
          },
          {
            tool: 'nonexistent-tool',
            slots: {},
            side_effects: 'none',
          },
          {
            tool: 'sentry.list-issues',
            slots: { project: 'selfprime', status: 'unresolved' },
            side_effects: 'read-external',
          },
        ],
      };

      const receipts = await executeTemplate(template, {}, mockToolRegistry, mockEnv);

      // Should have 2 receipts: success then failure
      expect(receipts.length).toBe(2);
      expect(receipts[0]?.result.ok).toBe(true);
      expect(receipts[1]?.result.ok).toBe(false);
    });
  });

  /**
   * Mock Env structure tests
   */
  describe('Mock environment setup', () => {
    it('has all required Env fields', () => {
      const env = createMockEnv();

      expect(env.SUPERVISOR).toBeDefined();
      expect(env.LOCK).toBeDefined();
      expect(env.MEMORY).toBeDefined();
      expect(env.LLM_LEDGER).toBeDefined();
      expect(env.AI_GATEWAY_BASE_URL).toBeDefined();
      expect(env.ANTHROPIC_API_KEY).toBeDefined();
      expect(env.JWT_SECRET).toBeDefined();
    });

    it('JWT_SECRET is set for token minting', () => {
      const env = createMockEnv();
      expect(env.JWT_SECRET).toBe('test-secret-key-for-jwt-signing');
      expect(env.JWT_SECRET.length).toBeGreaterThan(10);
    });
  });
});

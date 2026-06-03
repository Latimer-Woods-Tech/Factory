/**
 * @latimer-woods-tech/agent
 *
 * Cloudflare-native LLM agent runtime. Powers Factory's vertical SaaS products
 * (Voice, Video, Astrology) on one hardened orchestration engine.
 *
 * See `docs/architecture/AGENT_RUNTIME.md` for the full design. This first slice
 * establishes the tool registry — the shared seam between the deterministic
 * supervisor planner and the LLM reasoning loop. The reasoning loop, session
 * Durable Object, memory tiers, and guardrails land in subsequent slices.
 */

export {
  ToolRegistry,
  isLLMExposed,
  type Tool,
  type ToolResult,
  type SideEffects,
} from './registry.js';

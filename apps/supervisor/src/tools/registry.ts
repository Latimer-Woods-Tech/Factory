/**
 * Tool registry — each tool declares a name, scope, side_effects, and a
 * pure `invoke` function. Tools come from each app's capabilities.yml at
 * runtime (SUP-3.2 forward-declarations). Phase 1 ships an empty registry
 * + the shape so SUP-3.5 can drop real tools in.
 */
export type SideEffects = 'none' | 'read-external' | 'write-app' | 'write-external';

export interface Tool {
  name: string;                       // e.g. "humandesign.admin.users.suspend"
  description: string;
  side_effects: SideEffects;
  required_scope: string;             // JWT scope claim required to invoke
  invoke: (slots: Record<string, unknown>) => Promise<{ ok: true; result: unknown } | { ok: false; error: string }>;
}

export class ToolRegistry {
  private byName = new Map<string, Tool>();

  register(tool: Tool): void {
    this.byName.set(tool.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.byName.get(name);
  }

  list(): Tool[] {
    return Array.from(this.byName.values());
  }

  /**
   * Filter tools by tier trust. The supervisor's planner uses this to
   * restrict tool set based on Green/Yellow/Red tier of the run.
   */
  byTier(tier: 'green' | 'yellow' | 'red'): Tool[] {
    return this.list().filter((t) => {
      if (tier === 'green') return t.side_effects === 'none' || t.side_effects === 'read-external';
      if (tier === 'yellow') return t.side_effects !== 'write-external';
      return true;
    });
  }
}

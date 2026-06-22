import { describe, expect, it } from 'vitest';
import { AGENT_TOOLS, executeTool } from './ai-tools.js';

describe('AI tool surface', () => {
  it('does not expose secret manager reads to the model', () => {
    expect(AGENT_TOOLS.map((tool) => tool.name)).not.toContain('gcp_get_secret');
  });

  it('rejects removed secret-manager tool invocations', async () => {
    await expect(
      executeTool('gcp_get_secret', { secret_name: 'NEON_FACTORY_DATABASE_URL' }, 'github-token', {
        GCP_SA_KEY: 'service-account-key',
      }),
    ).resolves.toEqual({ error: 'unknown tool: gcp_get_secret' });
  });
});

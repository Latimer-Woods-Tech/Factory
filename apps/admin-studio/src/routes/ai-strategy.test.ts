import { describe, expect, it } from 'vitest';
import { getMissingStrategyConfig, isModelStrategy, resolveLlmOptions } from './ai.js';
import type { Env } from '../env.js';

const BASE_ENV = {
  AI_GATEWAY_BASE_URL: 'https://gateway.example.com',
  ANTHROPIC_API_KEY: 'anthropic-test',
  VERTEX_ACCESS_TOKEN: 'vertex-token',
  VERTEX_PROJECT: 'factory-test',
  VERTEX_LOCATION: 'us-central1',
  XAI_API_KEY: 'xai-test',
  GROQ_API_KEY: 'groq-test',
  DEEPSEEK_API_KEY: 'deepseek-test',
} satisfies Pick<
  Env,
  | 'AI_GATEWAY_BASE_URL'
  | 'ANTHROPIC_API_KEY'
  | 'VERTEX_ACCESS_TOKEN'
  | 'VERTEX_PROJECT'
  | 'VERTEX_LOCATION'
  | 'XAI_API_KEY'
  | 'GROQ_API_KEY'
  | 'DEEPSEEK_API_KEY'
>;

describe('AI model strategy routing', () => {
  it('accepts workbench as a first-class Admin Studio strategy', () => {
    expect(isModelStrategy('workbench')).toBe(true);
  });

  it('routes workbench to the DeepSeek-backed LLM tier with a bargain cap', () => {
    const opts = resolveLlmOptions('workbench', 'generate', 'system prompt');

    expect(opts.tier).toBe('workbench');
    expect(opts.model).toBeUndefined();
    expect(opts.maxCostUsd).toBe(0.10);
    expect(opts.workload).toBe('ticket-drafting');
    expect(opts.project).toBe('admin-studio');
  });

  it('requires only the gateway and DeepSeek key for workbench strategy config', () => {
    const missing = getMissingStrategyConfig('workbench', {
      ...BASE_ENV,
      ANTHROPIC_API_KEY: undefined as unknown as string,
      VERTEX_ACCESS_TOKEN: undefined as unknown as string,
      VERTEX_PROJECT: undefined as unknown as string,
      VERTEX_LOCATION: undefined as unknown as string,
      XAI_API_KEY: undefined,
    });

    expect(missing).toEqual([]);
  });

  it('does not require Anthropic for Gemini planning', () => {
    const missing = getMissingStrategyConfig('planning', {
      ...BASE_ENV,
      ANTHROPIC_API_KEY: undefined as unknown as string,
    });

    expect(missing).toEqual([]);
  });

  it('reports missing DeepSeek configuration for workbench', () => {
    const missing = getMissingStrategyConfig('workbench', {
      ...BASE_ENV,
      DEEPSEEK_API_KEY: undefined,
    });

    expect(missing).toEqual(['DEEPSEEK_API_KEY']);
  });
});

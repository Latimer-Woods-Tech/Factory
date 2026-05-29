import { complete } from '@latimer-woods-tech/llm';
import type { LLMEnv } from '@latimer-woods-tech/llm';
import { InternalError } from '@latimer-woods-tech/errors';

/**
 * Defines the voice and stylistic parameters of a brand or persona.
 */
export interface VoiceProfile {
  /** Adjectives describing the emotional tone (e.g. `['bold', 'empathetic']`). */
  tone: string[];
  /** Preferred words or phrases that signal this brand's voice. */
  vocabulary: string[];
  /** Words or phrases to actively avoid. */
  avoid: string[];
  /** Formality register of the copy. */
  register: 'formal' | 'professional' | 'conversational' | 'casual';
  /** A short example sentence that exemplifies this voice. */
  example: string;
}

/**
 * Built-in voice profiles for Factory applications.
 * @internal exported so consumers can read/extend them.
 */
export const voiceProfiles: Record<string, VoiceProfile> = {
  cypher_healing: {
    tone: ['warm', 'honest', 'grounded', 'hopeful'],
    vocabulary: ['healing', 'journey', 'transformation', 'wholeness', 'community'],
    avoid: ['hustle', 'grind', 'toxic positivity', 'quick fix'],
    register: 'conversational',
    example: 'Healing is not linear — and that is exactly why we walk together.',
  },
  prime_self: {
    tone: ['motivating', 'direct', 'ambitious', 'disciplined'],
    vocabulary: ['peak performance', 'elite', 'optimise', 'execute', 'standard'],
    avoid: ['lazy', 'excuse', 'average'],
    register: 'professional',
    example: 'Raise your standard. Execute without compromise.',
  },
  ijustus: {
    tone: ['authentic', 'spiritual', 'reflective', 'bold'],
    vocabulary: ['justice', 'truth', 'purpose', 'legacy', 'elevate'],
    avoid: ['surface-level', 'performative', 'hustle culture'],
    register: 'conversational',
    example: 'Real freedom starts when you stop performing and start living your truth.',
  },
  the_calling: {
    tone: ['urgent', 'prophetic', 'visionary', 'sacred'],
    vocabulary: ['calling', 'mission', 'anointed', 'chosen', 'covenant'],
    avoid: ['secular shortcuts', 'self-promotion without purpose'],
    register: 'formal',
    example: 'You were not placed here by accident. Step into the calling you were made for.',
  },
  default: {
    tone: ['clear', 'helpful', 'professional'],
    vocabulary: ['solution', 'value', 'results', 'simple', 'effective'],
    avoid: ['jargon', 'buzzwords'],
    register: 'professional',
    example: 'We help you get more done with less friction.',
  },
};

/** @internal in-memory registry for dynamically registered voices. */
const customVoices: Map<string, VoiceProfile> = new Map();

/**
 * Registers a custom voice profile for the given application ID.
 * Overrides any existing registration for that ID.
 */
export function registerVoice(appId: string, profile: VoiceProfile): void {
  customVoices.set(appId, profile);
}

/**
 * Retrieves the voice profile for the given application ID.
 * Falls back to the `'default'` profile if no profile is registered for `appId`.
 */
export function getVoiceProfile(appId: string): VoiceProfile {
  return customVoices.get(appId) ?? voiceProfiles[appId] ?? voiceProfiles['default']!;
}

function buildSystemPrompt(profile: VoiceProfile): string {
  return [
    `You are a copywriter writing in a ${profile.register} register.`,
    `Tone: ${profile.tone.join(', ')}.`,
    `Preferred vocabulary: ${profile.vocabulary.join(', ')}.`,
    `Do NOT use these words or phrases: ${profile.avoid.join(', ')}.`,
    `Example sentence that captures this voice: "${profile.example}"`,
    'Write only the requested copy text. Do not add explanations or meta-commentary.',
  ].join('\n');
}

/**
 * Options for {@link generateCopy}.
 */
export interface GenerateCopyOpts {
  /** The creative brief or instructions for the copy. */
  prompt: string;
  /** The application ID used to look up the brand voice profile. */
  appId: string;
  /** LLM environment bindings (API keys). */
  env: LLMEnv;
  /** Maximum character length hint passed in the prompt. Optional. */
  maxLen?: number;
}

/**
 * Generates brand-voice-aligned copy by combining the registered voice profile
 * with the given prompt and calling the `@latimer-woods-tech/llm` completion chain
 * (Anthropic → Grok → Groq failover).
 *
 * @example
 * ```ts
 * const copy = await generateCopy({
 *   prompt: 'Write a one-line homepage headline for a wellness app.',
 *   appId: 'cypher_healing',
 *   env: c.env,
 * });
 * ```
 */
export async function generateCopy(opts: GenerateCopyOpts): Promise<string> {
  const profile = getVoiceProfile(opts.appId);
  const systemPrompt = buildSystemPrompt(profile);
  const userPrompt = opts.maxLen
    ? `${opts.prompt}\n\nKeep the response under ${String(opts.maxLen)} characters.`
    : opts.prompt;

  const result = await complete(
    [{ role: 'user', content: userPrompt }],
    opts.env,
    { system: systemPrompt, tier: 'fast', maxTokens: 300, maxCostUsd: 0.05, project: opts.appId, actor: 'worker', workload: 'copy' },
  );

  if (!result.data) {
    throw new InternalError('LLM completion returned no data', { appId: opts.appId });
  }

  return result.data.content;
}

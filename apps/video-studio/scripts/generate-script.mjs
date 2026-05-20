/**
 * generate-script.mjs
 *
 * Standalone Node.js ESM script that generates a video narration script
 * (and optional step list) for a given Remotion composition.
 *
 * Uses @latimer-woods-tech/llm for the Anthropic → Grok → Groq failover chain.
 * Called by render-video.yml as:
 *   node apps/video-studio/scripts/generate-script.mjs
 *
 * Inputs (environment variables):
 *   COMPOSITION_TYPE      — MarketingVideo | TrainingVideo | WalkthroughVideo
 *   RESOLVED_TOPIC        — e.g. "Your Free Energy Blueprint: First Steps"
 *   SYSTEM_CONTEXT        — Full SYSTEM_CONTEXT.md contents
 *   KEY_POINTS_BLOCK      — Pre-formatted key-points block (may be empty)
 *   FORBIDDEN_BLOCK       — Pre-formatted forbidden-claims block (may be empty)
 *   TONE_BLOCK            — Pre-formatted tone-notes block (may be empty)
 *   BRIEF_LEARNING_GOAL   — Learning goal string (may be empty)
 *   BRIEF_KEY_POINTS      — JSON array string (used for step count)
 *   ANTHROPIC_API_KEY     — Anthropic API key
 *   AI_GATEWAY_BASE_URL  — Cloudflare AI Gateway base URL
 *   VERTEX_ACCESS_TOKEN  — GCP access token (JWT-bearer)
 *   VERTEX_PROJECT       — GCP project id
 *   VERTEX_LOCATION      — GCP region (default us-central1)
 *   GROQ_API_KEY          — Groq API key
 *   GITHUB_OUTPUT         — Path to GitHub Actions output file
 *
 * Outputs (written to GITHUB_OUTPUT):
 *   script    — Narration text (alias of `narration`, kept for back-compat)
 *   narration — Full narration script (becomes the Capricast transcript)
 *   headline  — Short on-screen headline derived from the topic (2–7 words)
 *   steps     — JSON array of step strings (TrainingVideo only, else [])
 */

import { appendFileSync } from 'node:fs';
import { complete, withSystem } from '@latimer-woods-tech/llm';

// ---------------------------------------------------------------------------
// Env
// ---------------------------------------------------------------------------
const {
  COMPOSITION_TYPE,
  RESOLVED_TOPIC   : topic,
  SYSTEM_CONTEXT   : systemCtx,
  KEY_POINTS_BLOCK : keyPts     = '',
  FORBIDDEN_BLOCK  : forbidden  = '',
  TONE_BLOCK       : tone       = '',
  BRIEF_LEARNING_GOAL: learningGoal = '',
  BRIEF_KEY_POINTS : briefKeyPts = '[]',
  ANTHROPIC_API_KEY = '',  AI_GATEWAY_BASE_URL = '',
  VERTEX_ACCESS_TOKEN  = '',
  VERTEX_PROJECT       = '',
  VERTEX_LOCATION      = 'us-central1',
  GROQ_API_KEY      = '',
  GITHUB_OUTPUT,
} = process.env;

const env = { AI_GATEWAY_BASE_URL, ANTHROPIC_API_KEY, GROQ_API_KEY, VERTEX_ACCESS_TOKEN, VERTEX_PROJECT, VERTEX_LOCATION };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const wordCount = (s) => s.trim().split(/\s+/).filter(Boolean).length;

/**
 * Calls complete() and returns the text content.
 * On provider failure throws so the workflow step fails hard.
 */
async function callLLM(messages, opts = {}) {
  const result = await complete(messages, env, opts);
  if (result.error !== null) {
    throw new Error(`All LLM providers failed: ${result.error.message}`);
  }
  return result.data.content.trim();
}

/** Writes key=value pairs to GITHUB_OUTPUT using heredoc format.
 *
 * Sanitizes values by removing any line that equals the heredoc delimiter,
 * preventing GITHUB_OUTPUT injection from untrusted content (e.g. LLM output).
 */
function writeOutput(pairs) {
  if (!GITHUB_OUTPUT) {
    // Local dev: just log the values
    for (const [k, v] of Object.entries(pairs)) {
      console.log(`::set-output name=${k}::${v.slice(0, 80)}...`);
    }
    return;
  }
  const lines = [];
  for (const [k, v] of Object.entries(pairs)) {
    const delimiter = `${k.toUpperCase()}_EOF`;
    // Strip any line that matches the delimiter to prevent heredoc injection.
    const safeValue = String(v).split('\n').filter((l) => l.trim() !== delimiter).join('\n');
    lines.push(`${k}<<${delimiter}`, safeValue, delimiter);
  }
  appendFileSync(GITHUB_OUTPUT, lines.join('\n') + '\n');
}

// ---------------------------------------------------------------------------
// Composition-specific generators
// ---------------------------------------------------------------------------

async function generateTrainingVideo() {
  const numSteps = JSON.parse(briefKeyPts).length || 4;

  const scriptSystemParts = [
    systemCtx,
    '',
    '## Current Task',
    'Write a 30-second training video narration for Prime Self.',
    'Your narration must be exactly 4 complete sentences.',
    'Target: 15-18 words per sentence (60-72 words total).',
    '',
    'EXAMPLE of correct sentence density (17 words):',
    '"You open your Free Energy Blueprint and see your Energy Type, Strategy, and Authority displayed clearly."',
    '',
    tone  ? `Tone: ${tone}`   : '',
    keyPts    ? `Cover these approved points:\n${keyPts}`  : '',
    forbidden ? `Do not state or imply any of these:\n${forbidden}` : '',
    '',
    'Voice rules: second-person only (you, your).',
    'Never use: journey, transformation, unlock, empower, amazing, leverage.',
    'No em dashes. No ellipses. No exclamation marks. Continuous narration, not a list.',
    '',
    'Output ONLY the 4 narration sentences. No JSON. No labels. No preamble.',
  ].filter(Boolean).join('\n');

  const userMsg = [
    `Topic: "${topic}"`,
    `Learning goal: "${learningGoal || 'Viewer understands the topic and knows their next action.'}"`,
    '',
    'Write the 4-sentence narration now.',
  ].join('\n');

  const callScript = withSystem(scriptSystemParts);

  // Primary attempt (temperature 0.6 = enough variation for dense prose)
  let script = (await callScript(
    [{ role: 'user', content: userMsg }],
    env,
    { temperature: 0.6, maxTokens: 320 },
  ).then((r) => {
    if (r.error) throw new Error(r.error.message);
    return r.data.content.trim().replace(/\n/g, ' ');
  }));

  const wc1 = wordCount(script);
  console.error(`First attempt word count: ${wc1}`);

  // Cold retry only if below threshold
  if (wc1 < 60) {
    console.error('Under target — cold retry with reinforced density framing...');
    const retrySystem = scriptSystemParts +
      `\n\nCRITICAL: Your previous attempt was only ${wc1} words. ` +
      'You MUST write information-dense sentences. Each sentence must name a ' +
      'specific Prime Self concept and describe what the viewer does with it. ' +
      'Aim for 16-18 words per sentence (64-72 words total).';
    const callRetry = withSystem(retrySystem);
    const retry = await callRetry(
      [{ role: 'user', content: userMsg }],
      env,
      { temperature: 0.7, maxTokens: 360 },
    );
    if (retry.error === null) {
      const retryText = retry.data.content.trim().replace(/\n/g, ' ');
      const wc2 = wordCount(retryText);
      console.error(`Retry word count: ${wc2}`);
      if (wc2 > wc1) script = retryText;
    }
  }

  // Steps — separate call at lower temperature for clean JSON
  const stepsRaw = await callLLM(
    [{
      role: 'user',
      content: `Write ${numSteps} action steps for a Prime Self training video.\nTopic: "${topic}"\nEach step: imperative verb phrase, 5-7 words.\nReturn ONLY a JSON array: ["step 1", "step 2", ...]`,
    }],
    { temperature: 0.4, maxTokens: 200 },
  );

  let steps = [];
  try {
    const cleaned = stepsRaw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    steps = JSON.parse(cleaned);
    if (!Array.isArray(steps)) steps = [];
  } catch {
    console.error('Steps parse failed, using empty array. Raw:', stepsRaw.slice(0, 200));
  }

  return { script, steps };
}

async function generateWalkthroughVideo() {
  const systemPrompt = [
    systemCtx,
    '',
    '## Current Task',
    'You are generating a WalkthroughVideo narration for Prime Self. Duration: 40 seconds. Word count: 90 to 110 words.',
    keyPts,
    forbidden,
    tone,
    '',
    'Output ONLY the narration text. No labels, no JSON, no formatting markers.',
    'Write exactly what Eric will say. Sentences max 18 words. No em dashes. No ellipses.',
  ].filter(Boolean).join('\n');

  const script = (await callLLM(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: `Topic: "${topic}"\n\nWrite the 40-second WalkthroughVideo narration now.` },
    ],
    { temperature: 0.3, maxTokens: 400 },
  )).replace(/\n/g, ' ');

  return { script, steps: [] };
}

async function generateMarketingVideo() {
  const systemPrompt = [
    systemCtx,
    '',
    '## Current Task',
    'You are generating a MarketingVideo narration for Prime Self. Duration: 15 seconds. Word count: 35 to 42 words.',
    keyPts,
    forbidden,
    tone,
    '',
    'Output ONLY the narration text. No labels, no JSON, no formatting markers.',
    'This is a punchy, high-impact marketing script. Lead with the outcome. End with a clear directive.',
    'Write exactly what Eric will say. Sentences max 18 words. No em dashes.',
  ].filter(Boolean).join('\n');

  const script = (await callLLM(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: `Topic: "${topic}"\n\nWrite the 15-second MarketingVideo narration now.` },
    ],
    { temperature: 0.3, maxTokens: 200 },
  )).replace(/\n/g, ' ');

  return { script, steps: [] };
}

// ---------------------------------------------------------------------------
// Headline generator — short on-screen headline derived from the topic.
// Single low-temperature call; falls back to the topic if the LLM call fails.
// ---------------------------------------------------------------------------
async function generateHeadline() {
  const systemPrompt = [
    'You write short on-screen video headlines.',
    'Output exactly one headline: 2 to 7 words, no punctuation other than internal hyphens.',
    'Never include quotes, colons, ellipses, em dashes, or exclamation marks.',
    'Output ONLY the headline text. No labels, no quotes, no preamble.',
  ].join('\n');
  try {
    const raw = await callLLM(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: `Topic: "${topic}"\n\nWrite the headline now.` },
      ],
      { temperature: 0.3, maxTokens: 40 },
    );
    return raw.split('\n')[0].replace(/^["'`]|["'`]$/g, '').trim() || topic;
  } catch (err) {
    console.error('headline generation failed, falling back to topic:', err.message);
    return topic;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
try {
  let result;
  if (COMPOSITION_TYPE === 'TrainingVideo') {
    result = await generateTrainingVideo();
  } else if (COMPOSITION_TYPE === 'WalkthroughVideo') {
    result = await generateWalkthroughVideo();
  } else {
    // MarketingVideo (default)
    result = await generateMarketingVideo();
  }

  const { script, steps } = result;
  console.error(`Final script word count: ${wordCount(script)}`);

  const headline = await generateHeadline();
  console.error(`Headline: ${headline}`);

  writeOutput({
    script,               // back-compat: old workflows still read `script`
    narration: script,    // explicit alias — what step 11 sends as transcript
    headline,             // short on-screen / Capricast title
    steps: JSON.stringify(steps),
  });
} catch (err) {
  console.error('generate-script fatal error:', err.message);
  process.exit(1);
}

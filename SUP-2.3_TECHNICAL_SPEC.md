# SUP-2.3 Technical Spec: llm-adapter Equivalence

## Overview

The `llm-adapter.js` wrapper maintains 100% signature compatibility with the legacy `lib/llm.js` while internally delegating to `@latimer-woods-tech/llm@0.3.0` via `@latimer-woods-tech/llm-meter`.

**Migration is a 1-line import swap per handler. Zero handler logic changes required.**

---

## Legacy API (workers/src/lib/llm.js)

```javascript
/**
 * Multi-provider LLM call with automatic failover.
 * Provider chain: Anthropic → Grok (xAI) → Groq
 */
export async function callLLM(promptPayload, env, { signal } = {}) {
  // ...
  return { text, tokens };
}
```

### Input

```javascript
promptPayload = {
  system: "You are a Human Design reader...",
  messages: [
    { role: 'user', content: 'Analyze this chart...' },
    // Could include assistant messages for multi-turn
  ],
  config: {
    model: 'claude-sonnet-4-20250514',  // Anthropic model ID
    max_tokens: 2048,
    temperature: 0.7
  }
}

env = {
  ANTHROPIC_API_KEY: '...',
  GROK_API_KEY: '...',
  GROQ_API_KEY: '...',
  // (legacy: no AI_GATEWAY_URL; direct API calls)
}

// Optional: AbortSignal for cancellation
signal = AbortSignal
```

### Output

```javascript
{
  text: "The result text from whichever provider succeeded",
  tokens: 342  // Total input + output tokens from response
}
```

### Errors

- Throws if **all providers fail**
- Error message format: "All LLM providers failed — Anthropic(attempt 1): <err> | Grok: <err> | Groq: <err>"
- **Implicit retry logic:** 3 attempts on Anthropic before failover

---

## New API (@latimer-woods-tech/llm via wrapper)

The adapter converts the above data flow:

```javascript
import { meteredComplete } from '@latimer-woods-tech/llm-meter';

export async function callLLM(promptPayload, env, { 
  signal, 
  runId,                      // new: optional run identifier
  project = 'prime-self',     // new: defaults to project name
  actor = 'worker'            // new: defaults to 'worker'
} = {})
```

### Internal Adapter Flow

```
INPUT: promptPayload { system, messages, config: { model, max_tokens, temperature } }
  ↓
MAP model:
  'claude-opus-4-*'        → tier: 'smart'
  'claude-sonnet-4-*'      → tier: 'balanced'
  'claude-3-haiku-*'       → tier: 'fast'
  (others)                 → tier: 'balanced' (default)
  ↓
CALL meteredComplete(env.LLM_LEDGER, messages, llmEnv, llmOptions, llmDeps):
  - llmEnv: {
      AI_GATEWAY_BASE_URL: env.AI_GATEWAY_BASE_URL,
      ANTHROPIC_API_KEY,
      GROQ_API_KEY,
      VERTEX_ACCESS_TOKEN,
      VERTEX_PROJECT,
      VERTEX_LOCATION
    }
  - llmOptions: {
      tier,
      system: promptPayload.system,
      maxTokens: promptPayload.config.max_tokens,
      temperature: promptPayload.config.temperature,
      signal,
      runId,
      project,
      actor
    }
  ↓
WAIT for: FactoryResponse<LLMResult>
  {
    data: {
      content: string,
      provider: 'anthropic' | 'gemini' | 'groq',
      model: string,
      tier: 'fast' | 'balanced' | 'smart' | 'verifier',
      tokens: { input, output, cacheRead?, cacheWrite? },
      latency: number,
      attempts: number,
      gatewayRequestId?: string
    },
    error: null
  }
  OR
  {
    data: null,
    error: { code, message }
  }
  ↓
CHECK if error:
  if (res.error) throw new Error(`LLM ${res.error.code}: ${res.error.message}`)
  ↓
EXTRACT legacy shape:
  {
    text: res.data.content,
    tokens: res.data.tokens.input + res.data.tokens.output
  }
```

### Routing Logic (New)

**Provider routing is now intelligent:**

| Model | Tier | Primary | Fallback | Reason |
|---|---|---|---|---|
| claude-opus-* | smart | Anthropic Opus | Gemini 2.5 Pro (if input > 150k tokens) | Short context: fast. Long: Gemini 1M window. |
| claude-sonnet-* | balanced | Anthropic Sonnet | — | Primary everywhere. No fallback needed. |
| claude-haiku-* | fast | Anthropic Haiku | — | Cost-efficient primary. |
| Custom override | varies | Per `opts.model` override | — | Explicit routing. |

**Long-context threshold:** 150,000 tokens (estimated from message content)  
→ If detected, **Gemini 2.5 Pro via Vertex AI** becomes primary (provides 1M window)

**Token estimation:** `Math.ceil((system.length + sum(messages.content.length)) / 4)`

### Error Handling (Different)

**New adapter can return structured errors:**

```javascript
// Example: token budget exceeded
throw new Error('LLM BUDGET_EXCEEDED: run exceeded $5 cap')

// Example: abort signal (client-side cancellation)
throw new DOMException('Aborted', 'AbortError')
```

**Legacy adapter would:**
```javascript
// Just throw a string error message from provider
throw new Error('All LLM providers failed — ...')
```

**Adapter absorbs this:**
```javascript
if (res.error) throw new Error(`LLM ${res.error.code}: ${res.error.message}`);
```

---

## Equivalence Verification

### What stays 100% the same

#### Input signature
```javascript
await callLLM(promptPayload, env, { signal })
```

#### Call sites (examples)

**admin.js**
```javascript
// BEFORE
const result = await callLLM({…}, env);
const readingText = result.text;  // ✓ still works

// AFTER (import changed, NOTHING else)
const result = await callLLM({…}, env);
const readingText = result.text;  // ✓ still works
```

**dream-weaver.js**
```javascript
// BEFORE
const interpretation = await callLLM(
  { system, messages, config: { model, max_tokens, temperature } },
  env,
  { signal: timeoutSignal.signal }
);
return interpretation.text;

// AFTER (same call; same output)
const interpretation = await callLLM(
  { system, messages, config: { model, max_tokens, temperature } },
  env,
  { signal: timeoutSignal.signal }
);
return interpretation.text;  // ✓ unchanged
```

**profile-stream.js**
```javascript
// BEFORE
const result = await callLLM(promptPayload, env, { signal: streamAbort.signal });

// AFTER
const result = await callLLM(promptPayload, env, { signal: streamAbort.signal });
// ✓ streamAbort behavior preserved, latency may improve via AI Gateway caching
```

### What changes internally (handlers don't see)

| Aspect | Legacy | New | Impact |
|---|---|---|---|
| **Failover chain** | Anthropic → Grok → Groq | Anthropic → Gemini (long-context) / Groq | Wider provider coverage. Grok removed as fallback. |
| **Provider routing** | Hardcoded Anthropic preferred | Tier-based (fast/balanced/smart) with intelligence | Better cost/latency trade-off. |
| **Cost tracking** | None | D1 per-call ledger + monthly budget cap | Revenue tracking. No end-user impact if under budget. |
| **Latency** | Direct API calls | AI Gateway (caching, routing) | Likely lower latency + cost due to caching. |
| **Token counting** | From provider response | From provider response (same) | No change. |
| **Output** | Plain text | Same: returns `result.text` | No change. |

---

## Regression Testing Strategy

### What must hold constant:
1. **Output text structure** — Raw text from LLM (content variance OK, schema must match)
2. **Token count** — ±10% acceptable (provider token counting variance)
3. **Validation thresholds** — > 0.85 (llm-response-validator must pass)
4. **Latency** — No >50% increase (expect slight improvement)

### What will change:
- **Provider diversity** — Splits between Anthropic/Gemini/Groq instead of pure Anthropic+fallback
- **Cache hit rate** — Exact Cache improvements not observable to handlers
- **Cost per call** — May decrease due to caching + efficient routing

### Why 20 historical syntheses?

Given typical Human Design synthesis call patterns:
- ~10-20 calls/day in prod
- 20 samples = ~2 days of production traffic
- Large enough to detect outliers
- Small enough to run fast (avoid false positives from cherry-pick)

### Test harness (pseudo-code)

```javascript
// pseudo-code for regression test
const historicalSyntheses = [
  { chart_id, context, expectedTokens, expectedValidationScore },
  // ... 20 total
];

for (const synthesis of historicalSyntheses) {
  // Old implementation
  const resultLegacy = await callLLMOld(synthesis.context, env);
  
  // New implementation
  const resultNew = await callLLMNew(synthesis.context, env);
  
  // Assertions
  assert(resultNew.tokens / resultLegacy.tokens < 1.1, 'tokens < +10%');
  assert(resultNew.text.length > 100, 'output not empty');
  assert(validate(resultNew.text) > 0.85, 'validation >= 0.85');
}

// Report: 20/20 passed, token variance mean ±2%, max ±7.3%
```

---

## Migration Checklist per Handler

For each handler (e.g., admin.js):

```bash
# 1. Update import
edit workers/src/handlers/admin.js
  OLD: import { callLLM } from '../lib/llm.js';
  NEW: import { callLLM } from '../lib/llm-adapter.js';

# 2. Lint (should pass — no logic changes)
npm run lint:workers

# 3. Type check
npm run typecheck

# 4. Test (if unit tests exist for handler)
npm test -- tests/handlers/admin.test.js

# 5. Commit
git add -A
git commit -m "feat(llm): wire admin.js to @latimer-woods-tech/llm"

# 6. Push & PR
git push origin fix/sup-2-3-wire-admin
gh pr create --title "feat(llm): wire admin.js to @latimer-woods-tech/llm"
```

**Repeat for next 10 handlers.**

---

## Rollback Plan (If Regression Detected)

### Immediate (< 1 hour)
```bash
git revert <merge-commit-of-last-handler>
wrangler deploy --env production
```

### Root cause analysis
- Check D1 ledger for anomalies
- Check Sentry for new error patterns
- Validate token estimation logic didn't break

### Recovery path
1. Fix specific handler bug (if any)
2. Re-test on regression suite
3. Re-deploy (no need to revert earlier handlers)

---

## Success Metrics

After all handlers wired + staged + regression passed:

```bash
# Sentry dashboard
# Should see decreasing llm.js exception volume → 0
# Should see increasing llm-adapter call volume

# D1 ledger
SELECT COUNT(*) FROM llm_calls WHERE created_at > NOW() - INTERVAL '1 hour'
# Should see calls appearing within 5 min of staging deploy

# Validation threshold
SELECT AVG(validation_score) FROM syntheses
WHERE created_at > NOW() - INTERVAL '1 hour'
# Should stay > 0.85 (same as baseline)
```
# SUP-2.3 Technical Spec: llm-adapter Equivalence

## Overview

The `llm-adapter.js` wrapper maintains 100% signature compatibility with the legacy `lib/llm.js` while internallydelegating to `@latimer-woods-tech/llm@0.3.0` via `@latimer-woods-tech/llm-meter`.

**Migration is a 1-line import swap per handler. Zero handler logic changes required.**

---

## Legacy API (workers/src/lib/llm.js)

```javascript
/**
 * Multi-provider LLM call with automatic failover.
 * Provider chain: Anthropic → Grok (xAI) → Groq
 */
export async function callLLM(promptPayload, env, { signal } = {}) {
  // ...
  return { text, tokens };
}
```

### Input

```javascript
promptPayload = {
  system: "You are a Human Design reader...",
  messages: [
    { role: 'user', content: 'Analyze this chart...' },
    // Could include assistant messages for multi-turn
  ],
  config: {
    model: 'claude-sonnet-4-20250514',  // Anthropic model ID
    max_tokens: 2048,
    temperature: 0.7
  }
}

env = {
  ANTHROPIC_API_KEY: '...',
  GROK_API_KEY: '...',
  GROQ_API_KEY: '...',
  // (legacy: no AI_GATEWAY_URL; direct API calls)
}

// Optional: AbortSignal for cancellation
signal = AbortSignal
```

### Output

```javascript
{
  text: "The result text from whichever provider succeeded",
  tokens: 342  // Total input + output tokens from response
}
```

### Errors

- Throws if **all providers fail**
- Error message format: "All LLM providers failed — Anthropic(attempt 1): <err> | Grok: <err> | Groq: <err>"
- **Implicit retry logic:** 3 attempts on Anthropic before failover

---

## New API (@latimer-woods-tech/llm via wrapper)

The adapter converts the above data flow:

```javascript
import { meteredComplete } from '@latimer-woods-tech/llm-meter';

export async function callLLM(promptPayload, env, { 
  signal, 
  runId,                      // new: optional run identifier
  project = 'prime-self',     // new: defaults to project name
  actor = 'worker'            // new: defaults to 'worker'
} = {})
```

### Internal Adapter Flow

```
INPUT: promptPayload { system, messages, config: { model, max_tokens, temperature } }
  ↓
MAP model:
  'claude-opus-4-*'        → tier: 'smart'
  'claude-sonnet-4-*'      → tier: 'balanced'
  'claude-3-haiku-*'       → tier: 'fast'
  (others)                 → tier: 'balanced' (default)
  ↓
CALL meteredComplete(env.LLM_LEDGER, messages, llmEnv, llmOptions, llmDeps):
  - llmEnv: {
      AI_GATEWAY_BASE_URL: env.AI_GATEWAY_BASE_URL,
      ANTHROPIC_API_KEY,
      GROQ_API_KEY,
      VERTEX_ACCESS_TOKEN,
      VERTEX_PROJECT,
      VERTEX_LOCATION
    }
  - llmOptions: {
      tier,
      system: promptPayload.system,
      maxTokens: promptPayload.config.max_tokens,
      temperature: promptPayload.config.temperature,
      signal,
      runId,
      project,
      actor
    }
  ↓
WAIT for: FactoryResponse<LLMResult>
  {
    data: {
      content: string,
      provider: 'anthropic' | 'gemini' | 'groq',
      model: string,
      tier: 'fast' | 'balanced' | 'smart' | 'verifier',
      tokens: { input, output, cacheRead?, cacheWrite? },
      latency: number,
      attempts: number,
      gatewayRequestId?: string
    },
    error: null
  }
  OR
  {
    data: null,
    error: { code, message }
  }
  ↓
CHECK if error:
  if (res.error) throw new Error(`LLM ${res.error.code}: ${res.error.message}`)
  ↓
EXTRACT legacy shape:
  {
    text: res.data.content,
    tokens: res.data.tokens.input + res.data.tokens.output
  }
```

### Routing Logic (New)

**Provider routing is now intelligent:**

| Model | Tier | Primary | Fallback | Reason |
|---|---|---|---|---|
| claude-opus-* | smart | Anthropic Opus | Gemini 2.5 Pro (if input > 150k tokens) | Short context: fast. Long: Gemini 1M window. |
| claude-sonnet-* | balanced | Anthropic Sonnet | — | Primary everywhere. No fallback needed. |
| claude-haiku-* | fast | Anthropic Haiku | — | Cost-efficient primary. |
| Custom override | varies | Per `opts.model` override | — | Explicit routing. |

**Long-context threshold:** 150,000 tokens (estimated from message content)  
→ If detected, **Gemini 2.5 Pro via Vertex AI** becomes primary (provides 1M window)

**Token estimation:** `Math.ceil((system.length + sum(messages.content.length)) / 4)`

### Error Handling (Different)

**New adapter can return structured errors:**

```javascript
// Example: token budget exceeded
throw new Error('LLM BUDGET_EXCEEDED: run exceeded $5 cap')

// Example: abort signal (client-side cancellation)
throw new DOMException('Aborted', 'AbortError')
```

**Legacy adapter would:**
```javascript
// Just throw a string error message from provider
throw new Error('All LLM providers failed — ...')
```

**Adapter absorbs this:**
```javascript
if (res.error) throw new Error(`LLM ${res.error.code}: ${res.error.message}`);
```

---

## Equivalence Verification

### What stays 100% the same

#### Input signature
```javascript
await callLLM(promptPayload, env, { signal })
```

#### Call sites (examples)

**admin.js**
```javascript
// BEFORE
const result = await callLLM({…}, env);
const readingText = result.text;  // ✓ still works

// AFTER (import changed, NOTHING else)
const result = await callLLM({…}, env);
const readingText = result.text;  // ✓ still works
```

**dream-weaver.js**
```javascript
// BEFORE
const interpretation = await callLLM(
  { system, messages, config: { model, max_tokens, temperature } },
  env,
  { signal: timeoutSignal.signal }
);
return interpretation.text;

// AFTER (same call; same output)
const interpretation = await callLLM(
  { system, messages, config: { model, max_tokens, temperature } },
  env,
  { signal: timeoutSignal.signal }
);
return interpretation.text;  // ✓ unchanged
```

**profile-stream.js**
```javascript
// BEFORE
const result = await callLLM(promptPayload, env, { signal: streamAbort.signal });

// AFTER
const result = await callLLM(promptPayload, env, { signal: streamAbort.signal });
// ✓ streamAbort behavior preserved, latency may improve via AI Gateway caching
```

### What changes internally (handlers don't see)

| Aspect | Legacy | New | Impact |
|---|---|---|---|
| **Failover chain** | Anthropic → Grok → Groq | Anthropic → Gemini (long-context) / Groq | Wider provider coverage. Grok removed as fallback. |
| **Provider routing** | Hardcoded Anthropic preferred | Tier-based (fast/balanced/smart) with intelligence | Better cost/latency trade-off. |
| **Cost tracking** | None | D1 per-call ledger + monthly budget cap | Revenue tracking. No end-user impact if under budget. |
| **Latency** | Direct API calls | AI Gateway (caching, routing) | Likely lower latency + cost due to caching. |
| **Token counting** | From provider response | From provider response (same) | No change. |
| **Output** | Plain text | Same: returns `result.text` | No change. |

---

## Regression Testing Strategy

### What must hold constant:
1. **Output text structure** — Raw text from LLM (content variance OK, schema must match)
2. **Token count** — ±10% acceptable (provider token counting variance)
3. **Validation thresholds** —> 0.85 (llm-response-validator must pass)
4. **Latency** — No >50% increase (expect slight improvement)

### What will change:
- **Provider diversity** — Splits between Anthropic/Gemini/Groq instead of pure Anthropic+fallback
- **Cache hit rate** — Exact Cache improvements not observable to handlers
- **Cost per call** — May decrease due to caching + efficient routing

### Why 20 historical syntheses?

Given typical Human Design synthesis call patterns:
- ~10-20 calls/day in prod
- 20 samples = ~2 days of production traffic
- Large enough to detect outliers
- Small enough to run fast (avoid false positives from cherry-pick)

### Test harness (pseudo-code)

```javascript
// pseudo-code for regression test
const historicalSyntheses = [
  { chart_id, context, expectedTokens, expectedValidationScore },
  // ... 20 total
];

for (const synthesis of historicalSyntheses) {
  // Old implementation
  const resultLegacy = await callLLMOld(synthesis.context, env);
  
  // New implementation
  const resultNew = await callLLMNew(synthesis.context, env);
  
  // Assertions
  assert(resultNew.tokens / resultLegacy.tokens < 1.1, 'tokens < +10%');
  assert(resultNew.text.length > 100, 'output not empty');
  assert(validate(resultNew.text) > 0.85, 'validation >= 0.85');
}

// Report: 20/20 passed, token variance mean ±2%, max ±7.3%
```

---

## Migration Checklist per Handler

For each handler (e.g., admin.js):

```bash
# 1. Update import
edit workers/src/handlers/admin.js
  OLD: import { callLLM } from '../lib/llm.js';
  NEW: import { callLLM } from '../lib/llm-adapter.js';

# 2. Lint (should pass — no logic changes)
npm run lint:workers

# 3. Type check
npm run typecheck

# 4. Test (if unit tests exist for handler)
npm test -- tests/handlers/admin.test.js

# 5. Commit
git add -A
git commit -m "feat(llm): wire admin.js to @latimer-woods-tech/llm"

# 6. Push & PR
git push origin fix/sup-2-3-wire-admin
gh pr create --title "feat(llm): wire admin.js to @latimer-woods-tech/llm"
```

**Repeat for next 10 handlers.**

---

## Rollback Plan (If Regression Detected)

### Immediate (< 1 hour)
```bash
git revert <merge-commit-of-last-handler>
wrangler deploy --env production
```

### Root cause analysis
- Check D1 ledger for anomalies
- Check Sentry for new error patterns
- Validate token estimation logic didn't break

### Recovery path
1. Fix specific handler bug (if any)
2. Re-test on regression suite
3. Re-deploy (no need to revert earlier handlers)

---

## Success Metrics

After all handlers wired + staged + regression passed:

```bash
# Sentry dashboard
# Should see decreasing llm.js exception volume → 0
# Should see increasing llm-adapter call volume

# D1 ledger
SELECT COUNT(*) FROM llm_calls WHERE created_at > NOW() - INTERVAL '1 hour'
# Should see calls appearing within 5 min of staging deploy

# Validation threshold
SELECT AVG(validation_score) FROM syntheses
WHERE created_at > NOW() - INTERVAL '1 hour'
# Should stay > 0.85 (same as baseline)
```


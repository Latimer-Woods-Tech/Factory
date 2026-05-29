# @latimer-woods-tech/llm

Tier-routed LLM orchestration for the Factory platform, with Cloudflare AI Gateway, Anthropic
primary, Gemini 2.5 Pro long-context fallback, Groq verifier, and DeepSeek workbench routing.

## Routing (0.3.0)

| Tier | Primary | Fallback | Notes |
|---|---|---|---|
| `fast` | Claude Haiku 4 | — | latency-sensitive, short completions |
| `balanced` *(default)* | Claude Sonnet 4 | Gemini 2.5 Pro | swaps to Gemini when est. tokens ≥ 150k |
| `smart` | Claude Opus 4 | Gemini 2.5 Pro | ditto; tools, long reasoning |
| `verifier` | Groq Llama 3.3 70B | — | cheap second opinion; no fallback |
| `workbench` | DeepSeek Chat | Groq Llama | boring, reviewable, non-sensitive batch work |

All traffic flows through `AI_GATEWAY_BASE_URL`. The gateway handles caching, rate-limit shedding,
and per-project cost telemetry.

## Usage

```ts
import { complete } from '@latimer-woods-tech/llm';

const ctl = new AbortController();
setTimeout(() => ctl.abort(), 30_000);

const res = await complete(
  [{ role: 'user', content: 'Draft a release note for llm@0.3.0.' }],
  {
    AI_GATEWAY_BASE_URL: env.AI_GATEWAY_BASE_URL,
    ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY,
    GROQ_API_KEY: env.GROQ_API_KEY,
    DEEPSEEK_API_KEY: env.DEEPSEEK_API_KEY,
    VERTEX_ACCESS_TOKEN: env.VERTEX_ACCESS_TOKEN,
    VERTEX_PROJECT: env.VERTEX_PROJECT,
    VERTEX_LOCATION: env.VERTEX_LOCATION,
  },
  {
    tier: 'balanced',
    signal: ctl.signal,
    runId: 'sup-run-0042',
    project: 'prime-self',
    actor: 'supervisor',
  },
);

if (res.ok) {
  console.log(res.data.content, res.data.provider, res.data.tokens);
}
```

Use `tier: 'workbench'` only for low-risk internal jobs: docs summaries, changelog drafts,
classification, issue triage, and other outputs a human or higher-trust model can review. Do not
send secrets, customer PII, production ops requests, billing data, or final customer-facing answers
through this lane.

## Vertex access token

Minted via the JWT-bearer flow from a GCP service account. See
`docs/runbooks/rotate-gcp-sa.md` for the mint procedure. Tokens are short-lived (1h); callers
should refresh before every cold start or every 50 minutes, whichever comes first.

## Budget

Every call emits a `llm.complete` log line with `{ provider, model, tier, tokens, runId, project,
actor }`. `@latimer-woods-tech/llm-meter` (0.1.0+) consumes these lines to enforce the per-run
$5 hard cap and the per-project steady-state budget.

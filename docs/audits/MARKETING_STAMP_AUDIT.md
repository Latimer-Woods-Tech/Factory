# Marketing Stamp Audit — 2026-05-21

**Goals**
- **A. AI scrub** — purge every user-facing "AI"/"artificial intelligence" reference across selfprime.net, Capricast, and Factory video-studio. Replace with brand-native language: *synthesis*, *the Synthesis*, *Prime Self synthesis engine*, *cinematic reading*, *Energy Blueprint*, *the engine*, etc.
- **B. Stamp marketing** with shipped capabilities not yet reflected on user-facing surfaces:
  - 4 new training videos (homepage-welcome MarketingVideo + 3 TrainingVideos) live on Cloudflare Stream
  - New `EnergyBlueprintVideo` Remotion composition (Grok-rendered Forge atmospheres) — on agent branch, not yet on Factory main
  - Agentic Commerce (Stripe ACS) end-to-end fulfillment shipped 2026-05-21 (PRs #228, #229)
  - Achievements system live (feature flag removed)
  - Six bugs fixed (PR #239): transit forecast, referrals, JS errors, LLM empty body, auth/export, sidebar
  - First published video live at https://capricast.com/watch/5209dd21-71a8-4ee4-afeb-0c030ade1a70

**Vocab carveout** (PRODUCT_PRINCIPLES.md §8): in-product copy uses brand terms (Energy Blueprint, Synthesis); SEO surfaces (marketing.html, llms.txt, guides) use canonical Human Design terms. Both surfaces now ban "AI" entirely.

---

## Replacement Vocabulary

| Old (user-facing) | New (brand-native) |
| --- | --- |
| AI synthesis reading | synthesis reading / cinematic synthesis reading |
| AI reading | synthesis reading |
| AI-generated reading | cinematic synthesis reading |
| AI-Powered Energy Blueprint Platform | Energy Blueprint Synthesis Platform |
| session prep AI / session-prep AI | guided session prep / synthesis session prep |
| AI Synthesis (product noun) | Synthesis |
| AI Context (practitioner tab) | Synthesis Context |
| AI Summary (button) | Synthesis Summary |
| AI Research (admin tool) | Synthesis Research |
| Prep with AI (button) | Synthesis Prep |
| AI tag (badge) | Synthesis tag |
| Share with AI for session context | Add to synthesis context for sessions |
| Shared with AI for context | Added to synthesis context |
| Claude AI weaves… | Prime Self's synthesis engine weaves… |
| Multi-model AI (Claude · Grok · Groq) | Multi-engine LLM |
| AI-First Pattern Synthesis | Cinematic Pattern Synthesis |
| AI Narrative Synthesis | Cinematic Narrative Synthesis |
| AI history | synthesis history |
| AI features (entitlements blurb) | synthesis features |
| Help combat AI art | Help protect human craft |
| AI creations must be labeled | Machine-generated work must be labeled |

---

## Repository Findings & Changes

### 1. Latimer-Woods-Tech/HumanDesign (`main` → `chore/marketing-stamp-ai-scrub`)

Branded surfaces re-scrubbed and stamped with shipped capabilities (training videos, Energy Blueprint video, achievements, agentic commerce).

| File | Change |
| --- | --- |
| `client/public/marketing.html` | Title, meta description, OG title/desc, Twitter title removed "AI"; added `og:video` tags for Stream UID `961578b45ca8e5ee39b461a426f58bac` (homepage-welcome video); JSON-LD `WebSite.description`, `Organization.description`, `SoftwareApplication.description` cleaned; `featureList` expanded with cinematic Energy Blueprint video, Training Library, Achievements & milestones; FAQ answers rewritten; hero subheadline + about prose rewritten; **new section added: "What's new on Prime Self"** covering all four shipped capabilities. |
| `client/public/llms.txt` | Full rewrite — every "AI synthesis" → "synthesis"; "AI-generated reading" → "cinematic synthesis reading"; expanded with **What's Shipped Recently** block (Energy Blueprint Video, Training Library, Achievements, Agentic Commerce). Vocabulary block now describes Energy Blueprint as prose + cinematic personal video. |
| `client/index.html` | SPA title, meta description, JSON-LD WebSite/SoftwareApplication descriptions; featureList expanded with Energy Blueprint video, Training Library, achievements; FAQ rewritten. |
| `client/public/pricing.html` + `client/public/pricing/index.html` | "Session prep AI" → "Guided session prep" in Practitioner tier subline. |
| `client/public/practitioners.html` | Journey card 2 and 3: "AI generates session prep notes…" → "The Prime Self engine surfaces session prep notes…"; "live AI support" → "live synthesis support". |
| `client/public/compare/index.html` | FAQ JSON-LD rewritten (3 questions); subhead "AI narrative synthesis" → "cinematic narrative synthesis"; comparison table rows "AI Narrative Synthesis" → "Cinematic Narrative Synthesis", "Session Notes + AI Summary" → "Session Notes + Synthesis Summary", "Yes — AI-assisted" → "Yes — synthesis-assisted"; diff cards rewritten ("AI-First Pattern Synthesis" → "Cinematic Pattern Synthesis"); pricing diff card "AI Pattern Synthesis" → "cinematic Pattern Synthesis". |
| `client/public/definitions.html` | Two FAQ answers updated. |
| `client/public/robots.txt` | Comment "AI crawlers" → "Retrieval / answer-engine crawlers" with note that user-agent strings below are vendor-published identifiers. Bot names themselves (anthropic-ai, cohere-ai, etc.) unchanged because they must match vendor user-agent strings. |
| `client/public/locales/en.json` + `client/locales/en.json` | `blueprint.reading_cta_desc` value updated. |
| `client/pages/personal/blueprint.js` | Section comment + login prompt + reading CTA description + free-tier comment updated. |
| `client/pages/practitioner/clients.js` | Tab labels, button labels, aria-labels, and toast/help text updated (AI Context → Synthesis Context, AI Summary → Synthesis Summary, Prep with AI → Synthesis Prep, etc.). |
| `client/pages/practitioner/dashboard.js` | Two activation step descriptions updated. |
| `client/pages/practitioner/readings.js` | Reading badge + share toggle label updated. |
| `client/public/js/admin/pages/bugs.js` | Admin "AI Research" button + toast updated (admin is internal staff but still user-facing per absolute rule). |
| `workers/src/lib/email.js` | Day-1 practitioner nurture email + welcome HTML updated. |
| `workers/src/handlers/auth.js` | Email verification success message. |
| `workers/src/handlers/billing.js` | Two downgrade messages. |
| `workers/src/handlers/practitioner.js` | 502 error messages + CSV column label. |
| `workers/src/handlers/session-notes.js` | 502 error message. |
| `workers/src/handlers/admin.js` | 502 error message. |
| `workers/src/handlers/support-email.js` | Email footer tagline. |
| `workers/src/handlers/chat.js` | LLM system prompt updated — explicit "speak as the Prime Self synthesis assistant, never refer to yourself as an AI, language model, or chatbot, and never give generic model disclaimers". |
| `README.md` | Top-line "AI-assisted interpretations" → "synthesis-driven interpretations"; "🌟 AI-Assisted Interpretation" → "🌟 Synthesis-Driven Interpretation"; step 3 of "How It Works" — "AI Synthesis: Claude AI weaves…" → "Synthesis: Prime Self's synthesis engine weaves… (cinematic personal video on top of prose)". |

**Strings changed (HumanDesign repo):** approximately **48 user-facing strings** + 1 net-new "What's new on Prime Self" section + OG video meta block on marketing.html.

**Deliberately left in (HumanDesign):**
- `workers/src/lib/errorMessages.js` line 118 (`// ── AI / LLM ──`) — internal code comment, never surfaces.
- `client/public/robots.txt` user-agent strings (`anthropic-ai`, `cohere-ai`, `OAI-SearchBot`, `ClaudeBot`, `GPTBot`, etc.) — these are vendor-published user-agent identifiers required for the robots policy to match the crawler. Comment above them now explicitly notes "User-agent strings below are vendor-published identifiers (do not edit)". The category comment was softened to "Retrieval / answer-engine crawlers".
- `README.md` line 196 — `AI_GATEWAY_URL` env var in developer section under "🔧 For Developers" — this is the Cloudflare AI Gateway product name (technical identifier), not a Prime Self brand claim.
- Internal docs/process/audits under `docs/archive/`, `audits/`, `process/`, `obsidian/`, `tests/` — explicitly out of scope per mission ("user-facing copy only, not internal docs").

### 2. Latimer-Woods-Tech/Factory (`main` → `chore/marketing-stamp-ai-scrub`)

Scope is `apps/video-studio/content-briefs/prime-self/` (LLM-fed briefs that produce user-facing narration).

| File | Change |
| --- | --- |
| `apps/video-studio/content-briefs/prime-self/ai-synthesis-walkthrough.json` | **Renamed** → `synthesis-walkthrough.json`. `briefKey`, `topic`, `learningGoal`, and `keyPoints` all scrubbed of "AI". |
| `apps/video-studio/content-briefs/prime-self/training-library.json` | Module entry for the walkthrough updated: `briefKey: synthesis-walkthrough`, `area: synthesis`, `topic: Reading Your Synthesis`. |
| `apps/video-studio/content-briefs/prime-self/homepage-welcome.json` | `keyPoints[2]` and `script` — "AI Synthesis" → "Synthesis" (two occurrences). |
| `apps/video-studio/content-briefs/prime-self/getting-started-first-week.json` | `keyPoints[2]` — "AI Synthesis" → "Synthesis". |
| `apps/video-studio/content-briefs/prime-self/session-prep-workflow.json` | `keyPoints[2]` + `forbiddenClaims[0]`. |
| `apps/video-studio/content-briefs/prime-self/dashboard-saved-blueprints.json` | `keyPoints[1]`. |
| `apps/video-studio/content-briefs/prime-self/platform-overview.json` | `keyPoints[2]`. |
| `apps/video-studio/content-briefs/prime-self/SYSTEM_CONTEXT.md` | Full rewrite of the "What Prime Self Is", "Methodology", and "The Synthesis" sections. **Vocabulary table** now flips "AI Synthesis" → "Synthesis" with explicit "NEVER say 'AI'" in the never-say column. **Forbidden Words list now includes**: AI, artificial intelligence, A.I., machine learning, ML, chatbot, language model, LLM. Added explicit ABSOLUTE RULE block: "Prime Self ICP has low trust for AI branding. The synthesis is 'the Synthesis', 'the Prime Self engine', 'your reading', or 'your Energy Blueprint' — never 'AI', 'the AI', or any model name." |

**Strings changed (Factory repo):** **9 brief/system-context strings** + 1 file rename + 1 net-new ABSOLUTE RULE block in SYSTEM_CONTEXT.md that locks future LLM output for every prime-self render.

**Deliberately left in (Factory):**
- `apps/video-studio/scripts/generate-script.mjs` line 29 — `AI_GATEWAY_BASE_URL` env-var name in a JSDoc comment (Cloudflare product identifier).
- `apps/video-studio/content-briefs/prime-self/SYSTEM_CONTEXT.md` line 115 — the absolute-rule block itself names "AI" to instruct the LLM not to produce it. This is meta-instruction, not user-facing output. Required for enforcement.

### 3. Latimer-Woods-Tech/capricast (`main` → `chore/marketing-stamp-ai-scrub`)

| File | Change |
| --- | --- |
| `apps/web/src/components/UploadForm.tsx` | Upload-form disclosure helper: "Help combat AI art and IP theft. AI creations must be labeled as such." → "Help protect human craft and IP rights. Machine-generated work must be labeled as such." |

**Strings changed (Capricast repo):** **1 user-facing string**.

**Deliberately left in (Capricast):**
- JSDoc/code comments in `apps/web/src/app/watch/[videoId]/page.tsx`, `apps/worker/src/routes/seo.ts`, `apps/worker/src/routes/admin.ts`, `apps/worker/src/lib/stream.ts`, `packages/db/src/schema/videos.ts`, `packages/types/src/index.ts` — all reference "AI retrievers", "AI crawlers", or "AI-generated captions" inside `/**` JSDoc blocks, never surfaced to users. These document the SEO/AEO pipeline for developers.
- `apps/web/public/robots.txt` and `apps/web/functions/robots.txt.ts` — Cloudflare's "AI Crawl Control" is the product name of a CF edge feature being worked around, not a Capricast brand claim. Vendor user-agent names (`Cohere-AI`, `anthropic-ai`, `cohere-ai`) are vendor-published identifiers and must match.
- `apps/web/public/_routes.json` and `apps/web/public/_headers` — same as above.
- All `docs/*.md` files (PROMPT_07, WORKERS_AI_CAPTIONS_GUIDE, PHASE_* files, BLERDART_*) — internal architecture/planning docs, not user-facing.
- `CLAUDE.md`, `CHANGELOG.md` — internal agent + maintenance docs, explicitly out of scope per mission.

---

## Verification

Post-fix grep across the user-facing file set returned **zero hits** for `\b(AI|A\.I\.|artificial intelligence|machine learning)\b` across:

- `HumanDesign/client/public/{marketing,index,pricing,practitioners,definitions,compare/index,pricing/index}.html`
- `HumanDesign/client/public/{llms.txt,locales/en.json}`
- `HumanDesign/client/index.html`
- `HumanDesign/client/locales/en.json`
- `HumanDesign/client/pages/{personal/blueprint,practitioner/{clients,dashboard,readings}}.js`
- `HumanDesign/client/public/js/admin/pages/bugs.js`
- `HumanDesign/workers/src/lib/email.js` (user-facing email HTML)
- `HumanDesign/workers/src/handlers/{auth,billing,practitioner,session-notes,admin,support-email,chat}.js` (user-facing error/email/CSV-label strings)
- `Factory/apps/video-studio/content-briefs/prime-self/*.json`
- `Capricast/apps/web/src/components/UploadForm.tsx`

The only remaining hits are inside internal `/** ... */` JSDoc blocks, line comments, code identifiers (env-var names like `AI_GATEWAY_BASE_URL`), vendor user-agent strings in robots.txt, and the meta-instruction block inside `SYSTEM_CONTEXT.md` that tells the LLM to never produce "AI" — all classified as non-user-facing per the mission allowlist.

---

## External Metadata Changelist

The following metadata lives **outside the codebase** — on Cloudflare Stream and (where applicable) YouTube. A separate operational pass should apply these updates via the Cloudflare Stream API (`PATCH /accounts/{id}/stream/{uid}`) and YouTube Data API (`videos.update`).

### Cloudflare Stream — Prime Self videos (renders dispatched from Factory)

| Stream UID | Current `meta.name` / description (assumed) | Proposed `meta.name` | Proposed description |
| --- | --- | --- | --- |
| `961578b45ca8e5ee39b461a426f58bac` | "Prime Self — homepage welcome (AI Synthesis)" | "Prime Self — Homepage Welcome" | "Prime Self turns your birth date, time, and location into a Free Energy Blueprint in seconds. Energy Type, Strategy, Authority, defined centers, and gates — interpreted as a single cinematic Synthesis combining Human Design, Frequency Keys, and natal astrology." |
| (Stream UID for `synthesis-walkthrough` — pending re-render) | "Reading Your AI Synthesis" | "Reading Your Synthesis" | "A guided walkthrough of your Synthesis — Energy Type, Strategy, Authority, Defined Centers, and Your Gates. Read them in order and anchor to one sentence that lands as immediately true." |
| (Stream UID for `getting-started-first-week` — see schedule-worker job) | "Getting Started: Your First Week (AI Synthesis)" | "Getting Started: Your First Week" | "Generate your Free Energy Blueprint, read your Energy Type, open your Synthesis, and save your Blueprint to your dashboard. Three concrete steps you complete in under two minutes each." |
| (Stream UID for `platform-overview`) | references "AI Synthesis" | "Discover Your Free Energy Blueprint" | "Prime Self calculates your Free Energy Blueprint from your birth data — date, time, and location. Your Synthesis translates the chart into plain, specific, immediately useful language. Two minutes to generate, instant to access." |

Exact UIDs for the last three should be pulled from `schedule_worker.video_calendar` rows where `app_id='prime_self'` and `status='done'` after the next re-render pass. The first UID (`961578…`) is the homepage hero video already embedded in `marketing.html`.

### YouTube — Prime Self channel

| Video ID | Current title (likely) | Proposed title | Proposed description first line |
| --- | --- | --- | --- |
| (homepage-welcome upload) | "Prime Self — AI Synthesis Reading" | "Prime Self — Your Pattern, Clear in Seconds" | "Your Free Energy Blueprint — Human Design, Frequency Keys, and natal astrology synthesised into one cinematic reading. Start free at selfprime.net." |
| (synthesis-walkthrough upload) | "Reading Your AI Synthesis" | "Reading Your Synthesis on Prime Self" | "A guided walkthrough of your Prime Self Synthesis — Energy Type, Strategy, Authority, Defined Centers, and Your Gates." |
| (getting-started upload) | "Getting Started: Your First Week (AI Synthesis)" | "Getting Started: Your First Week on Prime Self" | "Generate your Free Energy Blueprint, read your Energy Type, open your Synthesis, and save it to your dashboard. Three concrete steps for your first week." |
| (platform-overview upload) | "Discover Your Free Energy Blueprint with AI Synthesis" | "Discover Your Free Energy Blueprint" | "Prime Self turns your birth date, time, and location into a Free Energy Blueprint — Energy Type, Strategy, Authority, Gates — interpreted as a single cinematic Synthesis." |

### Capricast — published video metadata (database row in `videos` table)

| Capricast video slug / id | Field | Current (likely) | Proposed |
| --- | --- | --- | --- |
| `5209dd21-71a8-4ee4-afeb-0c030ade1a70` (first live video) | `title` | "Prime Self — AI Synthesis" | "Prime Self — Energy Blueprint Synthesis" |
| `5209dd21-71a8-4ee4-afeb-0c030ade1a70` | `description` | "AI-generated synthesis…" | "A cinematic personal synthesis of your Human Design chart, Frequency Keys, and natal astrology — your Energy Blueprint in plain language." |
| (3 Prime Self training videos rendered 2026-05-21) | `title` / `description` | "AI Synthesis" wording | Mirror Cloudflare Stream titles above. |

Apply via:
- Cloudflare Stream API: `curl -X POST -H "Authorization: Bearer $CF_STREAM_TOKEN" "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/stream/$UID" -d '{"meta":{"name":"…"}}'`
- YouTube Data API v3: `videos.update` with `part=snippet`, body containing updated `title`, `description`, `tags`.
- Capricast DB: `UPDATE videos SET title = $1, description = $2 WHERE id = $3` via the Capricast admin API (`PATCH /api/admin/videos/:id`).

---

## Open Followups (not in this PR set)

1. The `EnergyBlueprintVideo` Remotion composition (Grok-rendered Forge atmospheres) exists on the agent branch in this Factory worktree but has not landed on `main` yet. Once it merges, update `apps/video-studio/README.md` Compositions table and add a brief in `content-briefs/prime-self/energy-blueprint-video.json` describing its intended use.
2. Re-render the four prime-self training videos against the updated content briefs (drop the `ai-` prefix in `briefKey`, pull the new `Synthesis` vocabulary) so the narration audio matches the scrubbed scripts.
3. Apply the Cloudflare Stream + YouTube + Capricast DB metadata updates from the changelist above.
4. Sweep `docs/archive/`, `audits/`, `process/`, `obsidian/`, `tests/` in HumanDesign for AI references in internal docs — only if/when these become user-facing (currently they are not).

# Image Generation

**Version:** v1 · **Date:** 2026-05-18 · **Status:** Authoritative spec · **Owner:** @adrper79-dot · **Conflicts:** [`docs/supervisor/FRIDGE.md`](../supervisor/FRIDGE.md) wins; [`CONSTITUTION.md`](./CONSTITUTION.md) governs

> Closes grand-review item **A2**: the marketing system specifies how copy gets a voice gate ([`VOICES.md`](./VOICES.md), [`packages/validation/`](../../packages/validation/)) but says nothing about how images are produced, gated, paid for, or reused. This file is the strategy + architecture layer. The implementation brief (provider client, R2 layout, gate prompt, agent wiring) is a separate PR.

> If a behaviour isn't in this file, [`CONSTITUTION.md`](./CONSTITUTION.md), or a referenced brief, the image pipeline must not do it.

---

## 1. Purpose

Autonomous marketing produces image artefacts on every channel that isn't pure text — social, video thumbnails, email heroes, embed widgets, landing-page heroes, OG cards. Today there is no spec for how those images are generated, no parallel to the brand-voice gate, no cost ceiling, no reuse model. Without this doc:

- Every agent reinvents prompts; visual identity drifts across cells.
- The voice gate guards copy; nothing guards imagery — the failure mode is louder than off-voice copy.
- LLM-vision validation costs can rival generation costs and silently blow past the daily LLM budget.
- Cross-cell asset reuse is impossible without a registry.

This doc is the strategy layer. It defines what we generate, who governs it, what it costs, and what gets reused.

---

## 2. What needs images

Per channel surface, the artefacts the loop produces.

| Surface | Format | Volume hint | Voice cell context |
|---|---|---|---|
| Instagram feed + Reels covers | 1080×1350 (4:5) + 1080×1920 (9:16) | 1–2/day per cell | consumer cells |
| Pinterest pins | 1000×1500 (2:3) | 3–5/day per consumer cell | consumer cells |
| LinkedIn post + article hero | 1200×627 + 1200×628 | 3/week per practitioner cell | practitioner cells |
| X post inline + card | 1600×900 | 2/day | all earned-active cells |
| YouTube thumbnail | 1280×720 | 1/video | all video-active cells |
| TikTok cover (poster frame) | 1080×1920 | 1/video | consumer cells |
| Email hero | 1200×600 (retina-safe) | 1/lifecycle step | all cells |
| Practitioner-branded shareable (Selfprime reading export) | 1080×1080 + 1080×1920 | per reading produced | `prime_self:practitioner` |
| Embed widget OG / share image | 1200×630 | static per widget version | `selfprime:consumer` (cross-cell entry) |
| SEO blog post hero + OG | 1600×900 + 1200×630 | 1/post | all cells |
| Per-cell landing hero | 1920×1080 + responsive variants | 1/cell, rev'd quarterly | every filled cell |
| ICP-specific ad creative | per platform (Meta/Google variants) | gated by paid readiness | only `paid_ready`+ cells |

**Out of scope (this doc):** product UI screenshots (handled by product team), avatars/identity art for real practitioners (operator-curated), in-app illustrations (covered by app design system), animated/video assets (covered by [`packages/video/`](../../packages/video/)).

---

## 3. Visual matrix

Parallel to [`VOICES.md`](./VOICES.md) §2. One row per filled `(product, icp)` cell from [`ICP_MATRIX.md`](./ICP_MATRIX.md). Empty cells have no visual profile — publication on that cell blocks at the image-voice gate.

**Per-cell schema** (mirrors the voice schema):

- **Style descriptor:** 4–6 adjectives the prompt prepends.
- **Color palette:** 3–5 hex values, ordered primary → accent.
- **Typography overlay:** font family + weight rules when text is rendered onto the image. Always-pair with a font already licensed in [`packages/copy/`](../../packages/copy/) brand kit (operator-defined; TBD where empty).
- **Imagery rules — in scope:** subjects/treatments the prompt may include.
- **Imagery rules — out of scope:** subjects/treatments the prompt and gate must reject.
- **Channel format pin:** which channel sizes from §2 this cell ships to.

### `prime_self:practitioner`

| Field | Value |
|---|---|
| Style | restrained, technical, peer-professional, structured, low-saturation |
| Palette | TBD operator-defined; placeholder primary `#0F172A`, accent `#7C3AED` |
| Typography | sans, mono pairing for chart fragments; never script |
| In scope | chart geometry, glyph close-ups, monochrome workspace stills, abstract typographic compositions |
| Out of scope | stock-business clichés, hands-on-keyboard, generic "professional woman smiles," any astrology kitsch (crystals, neon zodiac wheels), guru iconography |
| Channels | LinkedIn, YouTube thumbnails, practitioner directory, email hero, reading export |

### `prime_self:consumer`

| Field | Value |
|---|---|
| Style | curious, modern, calmly energetic, editorial-clean |
| Palette | TBD; placeholder primary `#0EA5E9`, accent `#F59E0B`, base `#FAFAFA` |
| Typography | sans display + humanist body; chart glyphs allowed as accents |
| In scope | abstracted chart visualisations, gradient backgrounds, calm portraiture (licensed only), product UI in context |
| Out of scope | "spiritual" aesthetic shorthand, vibey purple-cosmos backgrounds, stock-influencer poses, fear/anxiety framing |
| Channels | TikTok cover, IG Reels cover, IG feed, Pinterest, YouTube Shorts thumb, email hero, SEO hero |

### `cypher_seeker`

| Field | Value |
|---|---|
| Style | warm, grounded, soft-light, embodied, unhurried |
| Palette | TBD; placeholder primary `#0E7C66`, accent `#D97757`, base `#FAF7F2` |
| Typography | humanist serif headlines; sans body |
| In scope | natural textures (linen, stone, water, plants), hands at rest, abstract botanical, soft-focus rooms |
| Out of scope | clinical/medical imagery, before-after, anything implying efficacy, "yoga influencer" tropes, white-savior framing, regulated-condition stock (depression, illness) |
| Channels | IG feed, Pinterest, email hero, SEO hero, landing |

### `cypher_practitioner`

| Field | Value |
|---|---|
| Style | collegial, plain, low-affect, container-respecting |
| Palette | TBD; shares cypher_seeker base; primary `#374151`, accent `#0E7C66` |
| Typography | same as cypher_seeker but quieter weights |
| In scope | empty therapy-room textures, notebooks, hands writing, abstract tool diagrams |
| Out of scope | client likenesses (ever, even licensed), session re-enactments, anything that breaks therapeutic frame, modality-specific certification iconography unless legally cleared |
| Channels | LinkedIn, email hero, practitioner directory, modality-partnership co-marketing assets |

### `xicocity_creator`

| Field | Value |
|---|---|
| Style | bold, kinetic, culturally rooted, high-contrast, irreverent |
| Palette | TBD operator-defined; deliberately not Western-default |
| Typography | display sans + occasional letterpress / hand-set treatments |
| In scope | street/scene photography (licensed or commissioned only), graphic typography compositions, drop-poster aesthetic |
| Out of scope | stock "vibrant Mexico" clichés, sombrero/cactus shorthand, anything flattening culture to commerce, AI-generated faces presented as real people |
| Channels | IG feed, IG Reels cover, TikTok cover, Pinterest, drop landing hero |

### `factory_internal`

| Field | Value |
|---|---|
| Style | precise, low-ceremony, diagram-first |
| Palette | grayscale + one accent (`#7C3AED`) for emphasis |
| Typography | mono for code/diagrams; sans for headings |
| In scope | architecture diagrams, dependency graphs, screen captures with annotations |
| Out of scope | photography, generative imagery, marketing-language overlays |
| Channels | package READMEs, ADRs, supervisor digest |

### `capricast:creator` *(queued, TBD)*

Positioning in flux per [`project_capricast_rename.md`](../../.claude/projects/c--Users-Ultimate-Warrior-Documents-GitHub-Factory/memory/project_capricast_rename.md). No profile registered. Publication on this cell blocks at the gate until operator defines it.

**Registration rules** (mirror of [`VOICES.md §3`](./VOICES.md#3-registration-rules)):

1. Cell must exist in [`ICP_MATRIX.md`](./ICP_MATRIX.md) at `discovery` or above.
2. Cell's ICP file lists the visual matrix fields in a §-positioning block.
3. ≥1 reference image per field where applicable (in-scope sample committed to R2 prefix `marketing-images/reference/{cell_key}/`).
4. Image-voice rules registered in [`packages/validation/`](../../packages/validation/) per cell key.

---

## 4. Pipeline architecture

```
campaign issue ── ImageStylist (or ContentDrafter) ── prompt build (matrix + brief)
       │                                                │
       │                                                v
       │                                       provider router (§4a)
       │                                                │
       │                                                v
       │                              raw image bytes (PNG/WebP)
       │                                                │
       │                                                v
       │                                  R2 putObject  marketing-images/raw/{cell}/{id}.webp
       │                                                │
       │                                                v
       │                       CopyEditor → image-voice gate (§5)
       │                                                │
       │                              ┌─────────────────┴─────────────────┐
       │                              │                                   │
       │                          clean / minor                       critical / major
       │                              │                                   │
       │                              v                                   v
       │                  variant render (channel sizes)       escalation queue (tier-3)
       │                              │
       │                              v
       │                    R2 putObject  marketing-images/published/{channel}/{cell}/{id}.{ext}
       │                              │
       │                              v
       │                 CDN serve via img.selfprime.net / img.cipherofhealing.com
       │                              │
       │                              v
       │              ChannelPublisher attaches URL to surface (X, IG, email, page hero)
```

### 4a. Provider stack

Recommendation — three providers, hot-failover and tier-routed by `image_tier` on the campaign issue.

| Tier | Provider | Model | Per-image | Reach for |
|---|---|---|---|---|
| **Primary** | Replicate | SDXL (1024×1024 base + community LoRAs) | ~$0.002–$0.01 | bulk daily social, A/B variants, drafts |
| **Premium** | Replicate (or BFL direct) | Flux Pro 1.1 / Flux Schnell | ~$0.04–$0.05 (Pro), ~$0.003 (Schnell) | landing heroes, OG cards, ad creative, anything that ships above the fold |
| **Fallback** | Vertex AI | Imagen 3 / Imagen 3 Fast | ~$0.02–$0.04 | when Replicate is down, when prompt safety policy needs Google's filter chain, when GCP egress is already free |

**Why this split, not a single provider:**

- SDXL on Replicate is the cheapest-per-image production-grade option and ships LoRA fine-tunes per cell when the operator commissions one.
- Flux Pro outperforms SDXL on photoreal typography overlays and "editorial clean" briefs — pay the premium only where the surface is hero-tier.
- Vertex Imagen uses our existing WIF auth (per [`reference_gcp_secret_manager_wiring.md`](../../.claude/projects/c--Users-Ultimate-Warrior-Documents-GitHub-Factory/memory/reference_gcp_secret_manager_wiring.md)) — no new key surface, no rotation overhead. Worth keeping as fallback even if it's never the primary.
- No DALL-E / OpenAI image API. Removes a provider key and keeps the LLM provider list aligned with [`docs/STACK.md`](../STACK.md).

**Provider router** lives in `packages/imagegen/` (new package, deps: errors, logger; mirrors `packages/video/` shape). API surface returns provider-agnostic `{ url, mime, width, height, providerMeta }`. Failover rule: primary → fallback within 8s timeout; never auto-promote to premium on failure (cost trap).

### 4b. Storage + delivery

- Raw bytes land in R2 bucket `marketing-images`, prefixed `raw/{cell_key}/{yyyy-mm}/{ulid}.webp`.
- Published variants (resized per channel) land at `published/{channel}/{cell_key}/{ulid}.{ext}`.
- Public delivery via custom domains `img.selfprime.net`, `img.cipherofhealing.com`, `img.xicocity.mx` — never `*.workers.dev` URLs (per [`CLAUDE.md` Hard Constraints](../../CLAUDE.md)).
- Cache: Cloudflare CDN; cache-key includes cell + variant; never include user identifiers.
- Lifecycle: raw bytes retained 90 days then archived to Coldline-equivalent R2 storage class; published variants retained while referenced (referrer-graph in Neon `marketing_image_refs`).

### 4c. Variant rendering

One generation → many channel sizes. Resizing happens in a Worker using R2 + Cloudflare Image Resizing — `wrangler.jsonc` Images binding, not external service. Per-channel size matrix lives in `packages/imagegen/src/variants.ts` and reads directly from §2's table.

---

## 5. Image-voice gate

Analogous to the brand-voice gate ([`CONSTITUTION.md §2`](./CONSTITUTION.md#2-brand-voice-gate)). **Every** image destined for public surfaces passes the gate before publication. No exceptions, including ad creative and shareables.

**What it validates:**

| Check | How | Severity |
|---|---|---|
| Denylist visual content (per-cell `out_of_scope` from §3) | Claude vision call: "Does this image contain X?" yes/no per denylist entry | critical (block) |
| Likeness without license | Claude vision detects faces; if detected, require a licensed-reference id in the issue body | critical (block) |
| Brand-fixed asset misuse | Logo / wordmark presence vs whitelist | major (block) |
| Style adherence to cell descriptor | CLIP cosine similarity against pinned matrix descriptors (cached) OR Claude vision rubric scoring | major (block if score < threshold), minor (log if borderline) |
| Typography compliance | Vision: any text rendered onto image must use whitelisted fonts; spell-check overlay text against artefact copy | major (block on misspell), minor (font drift) |
| Compliance (cypher_practitioner) | No medical/clinical signifiers, no efficacy framing | critical (block) |
| Honesty (per [§9](./CONSTITUTION.md#9-honesty--truth)) | No fabricated metrics in chart overlays; no fake testimonial portraits | critical (block) |

**Severity routing:**

- `critical` or `major` → block + tier-3 escalation issue (`escalation:image-voice-block`).
- `minor` → log to `marketing_artefacts.image_gate_issues`, allow publication, surface in weekly retro.

**Where it lives:** new module in [`packages/validation/`](../../packages/validation/) — `validateAiImage()` mirrors `validateAiOutput()`. Same severity types, same issue shape, same escalation routing in the supervisor.

**Gate-of-record:** CopyEditor agent runs it (per [`MARKETING_SUPERVISOR.md §3`](./MARKETING_SUPERVISOR.md#3-agent-roster) — extended scope). The gate is the bottleneck, not the generator.

---

## 6. Cost model

Per-image generation: $0.002–$0.05 depending on tier. Daily-volume baseline (steady state, 4 active cells):

| Tier | Daily images / cell | Cost / image | Daily cost / cell | Daily portfolio |
|---|---|---|---|---|
| Primary (SDXL bulk) | 40 | $0.005 | $0.20 | $0.80 |
| Premium (Flux hero) | 5 | $0.045 | $0.225 | $0.90 |
| Fallback (Imagen) | budgeted as 5% of primary | $0.03 | ~$0.006 | $0.024 |
| **Generation subtotal** | | | | **~$1.72/day** |

**The cost surprise: the gate rivals the generator.** Claude Haiku vision at ~$0.003 per image, run on every generated artefact, costs as much per image as SDXL itself produces it. At 50 images/cell/day × 4 cells, the gate is ~$0.60/day — 35% of generation spend.

**Mitigations** (designed in, not bolted on):

1. **Batch vision calls** — Claude vision supports up to 10 images per request. Single gate call per channel-batch drops effective per-image cost ~3×.
2. **CLIP-similarity cache** — pin matrix descriptors as CLIP embeddings; do similarity check in Worker (free), only escalate to Claude vision when CLIP score is in the ambiguity band. Drops vision-call rate ~70%.
3. **Reference-asset cache** — denylist / logo checks run against a SHA-indexed perceptual-hash registry first; only ambiguous results go to vision.
4. **Tier discipline** — premium tier capped at 5/cell/day at the budget gate. Primary tier is the default; agents must justify premium per issue.

**Hard caps** (extending [`BUDGET_CAPS.md`](./BUDGET_CAPS.md), to be added in that file's next revision):

- Image generation: $3/day per portfolio (~600 SDXL images), $20/day organization-wide cap.
- Image gate (vision): $2/day per portfolio.
- Combined image pipeline ceiling: $30/day org-wide. Hard refuse + tier-3 escalation per [`CONSTITUTION.md §3`](./CONSTITUTION.md#3-budget-caps).

---

## 7. Asset reuse

Brand-fixed assets are not regenerated. They are stored, versioned, and overlaid.

**Fixed-asset registry** at R2 prefix `marketing-images/fixed/`:

- `logos/{brand}/{variant}.svg` — wordmarks, marks, lockups per brand
- `primitives/{cell_key}/{name}.{ext}` — chart glyph sets, repeating textures, gradient backgrounds, frame templates
- `licensed/{cell_key}/{id}/{name}.{ext}` — operator-uploaded licensed photography + manifest with license + expiry

**Image library pattern:**

- Every gate-clean generation gets a `marketing_image_library` row keyed by `(cell_key, prompt_hash, channel)`.
- TopicScout and ContentDrafter query the library before requesting a new generation. Reuse rule: if a library entry with same `(cell, prompt_hash)` exists and is <30 days old and has positive engagement signal, reuse.
- The library is per-cell-tenanted; reuse across cells requires explicit operator allowlist (avoid cross-cell visual drift).

---

## 8. Compliance + safety

- **No people unless licensed.** AI-generated faces presented as real are forbidden (cypher_practitioner: forbidden at any layer including stock-style). Licensed reference photography is allowed and must carry a license manifest in `licensed/.../manifest.json`.
- **No copyrighted imagery.** No "in the style of {living artist}" prompts. No celebrity likenesses. The image-voice gate must include a prompt-side check (denylist of artist names + celebrity names) before generation, not just after.
- **Honesty (per [§9](./CONSTITUTION.md#9-honesty--truth)).** No fabricated metrics in overlaid charts; no fake "as seen on" badges; no synthetic testimonial portraits ever.
- **AI-generated EXIF tag.** Every published image carries C2PA / `XMP-AIGEN` metadata stamped at publish time (emerging standard; Meta/LinkedIn already read it). Stamping happens in the variant-render Worker.
- **Children.** No imagery depicting <16-year-olds, even illustrative.
- **Regulated verticals.** Cypher's health-claim gate (per [`CHANNEL_DOCTRINE.md` cypher:practitioner](./CHANNEL_DOCTRINE.md#cypherpractitioner)) extends to imagery — clinical signifiers and before/after framings are critical-severity denylist entries.

---

## 9. Agent integration

Two implementation options; one canonical choice for v1.

**Option A — new agent `ImageStylist`** (recommended for v1):

- Dedicated agent in the roster per [`MARKETING_SUPERVISOR.md §3`](./MARKETING_SUPERVISOR.md#3-agent-roster).
- Scope: prompt build (matrix + brief), provider routing, generation, raw write to R2.
- Inputs: campaign issue body + ContentDrafter artefact (so image references final copy).
- Outputs: `marketing_artefacts.image_url` (raw) + `marketing_image_runs` row with provider, model, cost.
- Max tier: T1 (draft only; gate is downstream).

**Option B — fold into ContentDrafter:**

- Lower agent count; tighter coupling between copy and visual.
- Risk: ContentDrafter's prompt surface gets unwieldy; cost-routing logic blurs.

**v1 choice: Option A.** Separation matches the voice gate's separation (drafter ≠ editor). Adding the agent requires the same ADR as any roster change.

**CopyEditor scope extension:** the image-voice gate (per §5) runs in CopyEditor. CopyEditor's `Max tier` and gate-of-record status are unchanged; gates list grows from `{voice}` to `{voice, image_voice}`.

**ChannelPublisher scope extension:** before posting, ChannelPublisher must request the correct channel variant via the variant-render Worker. If the variant doesn't exist, publish is deferred (not blocked) and the variant is rendered on demand.

---

## 10. What this doc deliberately doesn't include

- **Full builder brief** (provider client implementation, R2 layout codegen, gate-prompt full text, variant-render Worker code) — separate PR. This doc is strategy; the brief is implementation.
- **Per-cell color palettes and font families** — placeholders only. Operator-defined; will be filled in §3 cell-by-cell as the visual identity work lands. Cells without committed palettes block at the gate (style-adherence check fails on undefined descriptor).
- **Image-to-video extension** — [`packages/video/`](../../packages/video/) already covers MP4 production; if a future workflow needs "still-to-Ken-Burns-pan-MP4" the spec for that lives in the video doc, not here.
- **A/B testing of image variants** — covered by the general A/B framework in [`CONSTITUTION.md §8`](./CONSTITUTION.md#8-experimentation-discipline) + ExperimentRunner agent; nothing image-specific to add here.
- **Operator-curated photography workflow** — manifest + R2 upload mechanics handled in builder brief.
- **Capricast cell visual matrix** — TBD until product positioning lands.

---

## 11. Cross-references

| Doc / code | Why |
|---|---|
| [`CONSTITUTION.md`](./CONSTITUTION.md) | §2 voice gate (image gate is parallel); §3 budget caps; §7 tripwires; §9 honesty |
| [`VOICES.md`](./VOICES.md) | Schema parallel; registration rule parallel; cell keys must match |
| [`ICP_MATRIX.md`](./ICP_MATRIX.md) | Source of truth for cell list |
| [`CHANNEL_DOCTRINE.md`](./CHANNEL_DOCTRINE.md) | Channels needing images, surface conventions |
| [`MARKETING_SUPERVISOR.md`](./MARKETING_SUPERVISOR.md) | §3 agent roster (ImageStylist added); CopyEditor scope extension |
| [`BUDGET_CAPS.md`](./BUDGET_CAPS.md) | Image pipeline caps land here in next revision |
| [`ESCALATION_TIERS.md`](./ESCALATION_TIERS.md) | `escalation:image-voice-block` routing |
| [`packages/copy/src/index.ts`](../../packages/copy/src/index.ts) | Voice profile pattern this doc mirrors |
| [`packages/validation/`](../../packages/validation/) | `validateAiImage()` lives here |
| [`packages/video/`](../../packages/video/) | Existing R2 + Cloudflare wrapper shape `packages/imagegen/` follows |
| [`docs/STACK.md`](../STACK.md) | Provider list alignment (image providers added in next STACK revision) |
| [`CLAUDE.md`](../../CLAUDE.md) Hard Constraints | No `*.workers.dev` URLs; custom-domain delivery |
| [`reference_gcp_secret_manager_wiring.md`](../../.claude/projects/c--Users-Ultimate-Warrior-Documents-GitHub-Factory/memory/reference_gcp_secret_manager_wiring.md) | Vertex Imagen auth via existing WIF; no new key surface |

---

## Version history

| Date | Author | Change |
|------|--------|--------|
| 2026-05-18 | @adrper79-dot (drafted by Claude) | v1 — closes grand review item A2; visual matrix parallel to VOICES.md; Replicate/SDXL primary + Flux premium + Vertex Imagen fallback; image-voice gate spec; cost model with gate-cost surprise; ImageStylist agent + CopyEditor scope extension |

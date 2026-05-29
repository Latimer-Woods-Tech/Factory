# PR 3c — Voice Profile Matrix in `@lwt/copy`

**Status:** Drafted · **Depends on:** 3b
**Owner packages:** `@latimer-woods-tech/copy`, `@latimer-woods-tech/crm`
**Effort:** 2 days
**Branch:** `marketing/3c-voice-matrix` · **Bottleneck:** YES — blocks 3e, 3f, 3g, 3h

## 1. Goal

Migrate `@lwt/copy` from product-keyed voice profiles to **product × ICP keyed** voice profiles, per [`VOICES.md`](../VOICES.md). Extend the brand-voice gate rules in `@lwt/crm` `BRAND_PROFILES` correspondingly.

Today: `voiceProfiles['prime_self']` returns one profile per product.
After: `voiceProfiles['prime_self:practitioner']` returns the profile for the practitioner cell.

## 2. Non-goals

- ❌ Change `getVoiceProfile()` callers throughout the codebase (callers migrate in their own PRs; this PR keeps the old API working via alias)
- ❌ Multi-language voices (defer)
- ❌ Voice-corpus example bank infrastructure (defer to a sibling PR)
- ❌ Drift detection (PR 3m owns that)

## 3. Dependencies

- [`packages/copy/src/index.ts`](../../../packages/copy/src/index.ts) — current voice profile registry
- [`packages/crm/src/index.ts`](../../../packages/crm/src/index.ts) `BRAND_PROFILES` — brand-voice rules
- [`packages/validation/`](../../../packages/validation/) — `validateAiOutput`, `BrandVoiceRules`
- [`VOICES.md`](../VOICES.md) — full voice matrix spec; keys and content
- [`CONSTITUTION.md §2`](../CONSTITUTION.md#2-brand-voice-gate) — gate semantics
- PR 3b — ICP dimension columns (cell keys exist as data)

## 4. Migrations

No DDL. Code-only PR.

## 5. API shape

```ts
// packages/copy/src/index.ts

/** Key format: `{product}:{icp}` per VOICES.md §1.
 *  Backwards compat: `{product}` alone aliases to `{product}:default` with deprecation warning. */
export type VoiceKey = string;

/** Cross-voice rules applied at the generator level. */
export const globalVoiceRules = {
  maxSentenceWordsP50: 22,
  maxSentenceWords: 35,
  exclamationsPer500Words: 1,
  emojis: 0,
  acronymExpansionMinLength: 200,
};

/** Updated profile shape — adds metadata for the gate. */
export interface VoiceProfile {
  /** Adjectives describing the emotional tone. */
  tone: string[];
  /** Preferred words or phrases. */
  vocabulary: string[];
  /** Words or phrases to actively avoid. */
  avoid: string[];
  /** Formality register. */
  register: 'formal' | 'professional' | 'conversational' | 'casual';
  /** Example sentence. */
  example: string;
  /** Pronoun preference. */
  pronouns?: 'we' | 'you' | 'mixed';
  /** Reading level target (Flesch-Kincaid grade-level approx). */
  readingLevel?: { min: number; max: number };
}

export const voiceProfiles: Record<VoiceKey, VoiceProfile>;

/** Register a custom profile. */
export function registerVoice(key: VoiceKey, profile: VoiceProfile): void;

/** Retrieve a profile by key.
 *  Fallback chain: exact match → `{product}:default` → 'default'. */
export function getVoiceProfile(key: VoiceKey): VoiceProfile;

/** Updated generateCopy signature — voiceKey replaces appId. */
export interface GenerateCopyOpts {
  prompt: string;
  voiceKey: VoiceKey;        // NEW (replaces appId)
  env: LLMEnv;
  maxLen?: number;
}
// Old signature kept as overload with deprecation warning.
```

Initial registered keys (per [`VOICES.md §2`](../VOICES.md#2-the-voice-matrix)):

- `prime_self:default` (alias for backwards compat)
- `prime_self:consumer`
- `prime_self:practitioner`
- `prime_self:power`
- `cypher_seeker` (renamed from `cypher_healing`)
- `cypher_practitioner`
- `xicocity_creator`
- `factory_internal`
- `ijustus` (untouched legacy)
- `the_calling` (untouched legacy)
- `default` (unchanged)

Each profile's `tone`/`vocabulary`/`avoid`/`register`/`example`/`pronouns`/`readingLevel` populated from [`VOICES.md §2`](../VOICES.md#2-the-voice-matrix).

```ts
// packages/crm/src/index.ts — extend BRAND_PROFILES

/** Keyed by VoiceKey now (per VOICES.md §3 registration rule). */
const BRAND_PROFILES: Record<VoiceKey, BrandVoiceRules>;

// Populate with per-VoiceKey rules. Examples:
//   'prime_self:practitioner': { requiredTerms: [], blockedTerms: ['newbie','casual','amateur'] }
//   'cypher_practitioner': { requiredTerms: [], blockedTerms: ['guru','expert'] }

/** Updated getBrandVoiceRules takes VoiceKey not appId. */
function getBrandVoiceRules(key: VoiceKey): BrandVoiceRules | undefined;
```

## 6. Test plan

- **Unit tests:**
  - All 10+ keys from VOICES.md §2 registered
  - `getVoiceProfile('prime_self')` returns `prime_self:default` with deprecation warning (use Vitest spy on console.warn)
  - `getVoiceProfile('unknown_key')` falls through to `default`
  - Each profile's `tone`, `vocabulary`, `avoid` match VOICES.md word-for-word (string array assertion)
  - `globalVoiceRules` constants exposed and importable
  - `generateCopy({ voiceKey: 'prime_self:practitioner', ... })` produces a string
  - `generateCopy({ appId: 'prime_self', ... })` (old signature) still works with deprecation warning
- **Snapshot tests:** the system prompt assembled for each voice profile matches a checked-in snapshot (catches accidental regressions in voice spec)
- **Brand-voice gate integration:** `validateAiOutput` with `getBrandVoiceRules('prime_self:practitioner')` rejects strings containing `'newbie'`
- **Coverage:** 95%+ lines (small package, easy)

## 7. Verification

```bash
# In a Workers env with ANTHROPIC_API_KEY set
curl -X POST http://localhost:8787/test/generate-copy \
  -d '{"voiceKey":"prime_self:practitioner","prompt":"Write a one-sentence headline for the practitioner landing page."}'
# Expect: a sentence in direct, peer-to-peer tone; does not contain "newbie" or "casual"

curl -X POST http://localhost:8787/test/generate-copy \
  -d '{"voiceKey":"cypher_practitioner","prompt":"Write a one-sentence headline."}'
# Expect: a sentence that does NOT contain "guru" or "expert"

# Voice gate test
curl -X POST http://localhost:8787/test/validate \
  -d '{"voiceKey":"prime_self:practitioner","text":"Hey newbies! Check this out."}'
# Expect: 200 with issues array including a 'major' severity issue for "newbie"
```

## 8. Acceptance criteria

- [ ] All keys from [`VOICES.md §2`](../VOICES.md#2-the-voice-matrix) registered in `voiceProfiles`
- [ ] Each profile matches the doc spec (assertion test catches drift)
- [ ] Old single-key API still works with deprecation warning
- [ ] `globalVoiceRules` exposed and used by generator
- [ ] `BRAND_PROFILES` keyed by `VoiceKey`; old keys aliased
- [ ] `generateCopy` accepts `voiceKey` (new) or `appId` (legacy with warning)
- [ ] Test coverage ≥95% lines
- [ ] No `console.log`/`console.error` in production code (only `console.warn` for deprecations, which is allowed by lint config)
- [ ] CHANGELOG.md in both `@lwt/copy` and `@lwt/crm`; minor version bumps
- [ ] Verification curls above succeed in staging

## 9. File list

```
packages/copy/
  src/
    index.ts             # extend registry; new API
    profiles.ts          # NEW — voice profile constants (matches VOICES.md)
    global-rules.ts      # NEW — cross-voice rules
  test/
    index.test.ts        # extend; new key tests
    profiles.test.ts     # NEW — assert profile content matches VOICES.md
    snapshots/           # NEW — system-prompt snapshots
      prime_self_practitioner.txt
      ...

packages/crm/
  src/
    index.ts             # update BRAND_PROFILES key shape
    brand-profiles.ts    # NEW (extracted from index for clarity)
  test/
    index.test.ts        # extend
```

## 10. Risks + mitigations

| Risk | Mitigation |
|---|---|
| Drift between VOICES.md and `profiles.ts` | `profiles.test.ts` reads VOICES.md and asserts each profile matches; commit-hook prompted but not required |
| Existing callers break | Deprecation warning only; full removal in a future major bump |
| Brand-voice gate now too strict | The gate has 3 severity tiers; `minor` issues are non-blocking per [`CONSTITUTION.md §2`](../CONSTITUTION.md#2-brand-voice-gate). Monitor `minor` rate. |

## 11. Cross-references

- [`VOICES.md`](../VOICES.md) — full voice matrix spec
- [`CONSTITUTION.md §2`](../CONSTITUTION.md#2-brand-voice-gate) — gate semantics
- [`packages/copy/src/index.ts`](../../../packages/copy/src/index.ts) · [`packages/crm/src/index.ts`](../../../packages/crm/src/index.ts) · [`packages/validation/`](../../../packages/validation/)
- PR 3b (bottleneck predecessor)
- PR 3m — brand-safety tripwire reads voice gate failure rate

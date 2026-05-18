# Campaign Tagging

**Version:** v1 · **Date:** 2026-05-18 · **Status:** Authoritative · **Owner:** @adrper79-dot

> The naming convention for every campaign the autonomous loop runs. Five-dimensional tag — `(product, icp, channel, surface, campaign_id)` — applied to every published artefact, every email send, every paid spend, every event. Without this, decomposition in [`KPI_DECOMPOSITION.md`](./KPI_DECOMPOSITION.md) breaks and [`ATTRIBUTION.md`](./ATTRIBUTION.md) attributes to noise.

---

## 1. The 5-tuple

Every campaign is identified by exactly five fields. Tags are immutable once published — corrections happen via a new campaign, never by editing tag values.

| Field | Required | Format | Example |
|---|---|---|---|
| `product` | ✅ | Lowercase product slug | `selfprime`, `cypher`, `xicocity`, `factory` |
| `icp` | ✅ | ICP archetype slug (URL-safe form from [`ICP_MATRIX.md`](./ICP_MATRIX.md)) | `practitioner`, `consumer`, `power`, `studio`, `partner`, `internal` |
| `channel` | ✅ | Canonical channel name from [`CHANNEL_DOCTRINE.md §1`](./CHANNEL_DOCTRINE.md) source map | `linkedin`, `youtube`, `email_*`, `astrology_podcast` |
| `surface` | ✅ | Where the artefact lives (URL pattern or platform-native identifier) | `landing/practitioner`, `embed/chart`, `dm/cold` |
| `campaign_id` | ✅ | Identifier — kebab-case, year-quarter-prefix | `2026-q3-practitioner-design-partners` |

**Canonical string form:**

```
{product}/{icp}/{channel}/{surface}/{campaign_id}
```

Example: `selfprime/practitioner/linkedin/post-feed/2026-q3-practitioner-design-partners`

---

## 2. campaign_id naming

The single hardest field to get right. Rules:

1. **Year-quarter prefix:** `YYYY-q[1-4]-` (lowercase `q`). Reflects fiscal quarter the campaign launches.
2. **Audience descriptor:** noun phrase identifying the audience or motion. Examples: `practitioner-design-partners`, `consumer-tiktok-launch`, `winback-lapsed-q2`.
3. **Optional variant suffix:** when running A/B tests, add `-arm-a` / `-arm-b` (the `arm` token is the suffix the experimentation framework reads).
4. **No version numbers** in the id — campaigns are immutable. A v2 of the same idea is a new campaign with a new id.
5. **No PII** (no customer names, no email addresses).
6. **No personal pronouns** (`my-`, `our-`).
7. **Kebab-case** (`-`); not snake_case, not camelCase.
8. **≤64 characters total** including the year-quarter prefix.
9. **Unique within a quarter** across the portfolio. The supervisor loop reserves the id on creation.

**Example ids:**

| ✅ Good | ❌ Bad | Why |
|---|---|---|
| `2026-q3-practitioner-design-partners` | `Q3-design-partners` | Missing year, missing audience clarity |
| `2026-q2-consumer-tiktok-launch-arm-a` | `consumer-launch-v2-final-FINAL` | Versioning; should be new campaign |
| `2026-q3-cypher-podcast-tour` | `2026-q3-eve-aubrey-marcus-pitch` | PII (named person in id) |
| `2026-q2-winback-lapsed-30d` | `winback-may-2026` | Date-style id; loses quarter context |

---

## 3. Where the tag lives

The tag is propagated through every system. Source of truth: the **supervisor loop**.

| System | Field(s) | Notes |
|---|---|---|
| URL UTM params | `utm_source=channel`, `utm_medium`, `utm_campaign=campaign_id`, `utm_content=icp` | Per [`ATTRIBUTION.md §2`](./ATTRIBUTION.md#2-utm-capture) |
| `factory_events.properties` | `{ product, icp, channel, surface, campaign_id }` | Every event carries the tuple |
| `crm_leads` columns | `first_touch_campaign`, `last_touch_campaign` | Stamped per [`ATTRIBUTION.md §4`](./ATTRIBUTION.md#4-touch-stamping-rules) |
| `outreach_campaigns.name` | Mirror of `campaign_id` | CRM campaign rows align 1:1 with marketing campaigns |
| `content_items` (PR 3b) | New columns: `cell_key`, `channel`, `campaign_id` | Content publisher reads these for routing |
| Resend email tags | `tags: [{name:'campaign', value: campaign_id}, ...]` | Per [`packages/email/src/index.ts`](../../packages/email/src/index.ts) |
| PostHog event properties | Same 5 fields | Standard property names; supervisor inserts |
| Stripe `Subscription.metadata` | `{ campaign_id, first_touch_campaign }` | Webhook records on conversion |
| GitHub Issues (marketing kanban) | Label `campaign:{campaign_id}` | Per [`MARKETING_SUPERVISOR.md`](./MARKETING_SUPERVISOR.md) |
| Cloudflare Worker logs | Structured field `campaign_id` | Per `@lwt/logger` |

---

## 4. Campaign lifecycle states

Campaigns are kanban cards (GitHub Issues per [`MARKETING_SUPERVISOR.md`](./MARKETING_SUPERVISOR.md)). State labels:

| State | Definition |
|---|---|
| `draft` | Generated copy + metadata exists; not yet gate-validated |
| `review` | Gate failed; in operator queue OR awaiting auto-revision |
| `queued` | Gate passed; awaiting schedule slot |
| `published` | Live; the loop is observing |
| `measured` | Window closed; metrics computed |
| `retro` | Retro doc written; lessons folded back into voice corpus / channel state |
| `archived` | Closed; immutable record |
| `paused` | Operator-initiated pause; `paused_at`, `paused_by`, `pause_reason` recorded |

Transitions are auto-driven except `paused` (operator-initiated per [`CONSTITUTION.md §10`](./CONSTITUTION.md#10-operator-escalation-rights)). State transition rules in [`MARKETING_SUPERVISOR.md`](./MARKETING_SUPERVISOR.md).

---

## 5. Reserved keys (don't use these as values)

Values that the supervisor loop treats specially. Don't shadow them as campaign ids or channel names:

| Token | Where used | Why reserved |
|---|---|---|
| `direct` | `channel`, attribution sources | "No referrer" sentinel |
| `unknown` | All five fields when unresolved | Pre-identification sentinel |
| `test` | `campaign_id` prefix | Reserved for test runs that don't count in dashboards |
| `bot` | All five fields | Reserved for bot traffic filtering |
| `internal` | `icp` | Reserved for Factory-internal cell only |
| `default` | `icp` | Backwards-compat alias only |

---

## 6. Audit + retro

Every campaign produces a retro doc on transition to `retro` state, at:

```
docs/marketing/playbooks/retros/{campaign_id}.md
```

Template (auto-filled by the supervisor's `RetroWriter` agent per [`MARKETING_SUPERVISOR.md`](./MARKETING_SUPERVISOR.md)):

```markdown
# Retro — {campaign_id}

**Period:** YYYY-MM-DD → YYYY-MM-DD
**Cell:** {product}:{icp}
**Channel:** {channel} / {surface}
**Hypothesis:** (declared at draft — was it tested?)
**Primary metric:** ... · target ... · result ...
**Outcome:** win / draw / loss / inconclusive

## What worked
## What didn't
## Lessons folded back
- [ ] Voice corpus update (added N artefacts)
- [ ] Baseline updates ([`KPI_DECOMPOSITION.md`](../../KPI_DECOMPOSITION.md))
- [ ] Channel state advancement (yes/no)
## Next campaign ideas
```

Retro docs are searchable evidence for any future campaign in the same channel × cell.

---

## 7. Sample campaign annotation (worked example)

A LinkedIn-published artefact in the practitioner design-partner campaign:

```yaml
# Campaign metadata (stored on the GitHub Issue + cross-referenced from artefact)
product: selfprime
icp: practitioner
channel: linkedin
surface: post-feed
campaign_id: 2026-q3-practitioner-design-partners
hypothesis: >
  Direct, peer-to-peer copy about prep-time reduction
  converts working astrologers at >2x our baseline practitioner-cell rate.
primary_metric: lead_quality_score
target: ≥4.0 / 5 (operator-judged at 30 days)
budget: $0 (earned channel)
state: published
published_at: 2026-07-15T15:00:00Z
voice_key: prime_self:practitioner
artefact_id: lwt-li-2026-07-15-prep-time
```

Same metadata fans out to:
- URL `selfprime.net/practitioners?utm_source=linkedin&utm_medium=social&utm_campaign=2026-q3-practitioner-design-partners&utm_content=practitioner`
- `factory_events` for every click on that URL
- `crm_leads.first_touch_campaign` for any conversion
- Stripe `Subscription.metadata.campaign_id` if the lead pays
- The retro doc at `playbooks/retros/2026-q3-practitioner-design-partners.md`

---

## 8. Validation

The supervisor's `CampaignValidator` rejects campaign creation that doesn't satisfy:

- All 5 fields present
- `product` ∈ {known product slugs}
- `icp` ∈ {ICPs whose matrix cell is `discovery` or above}
- `channel` ∈ {channels in cell's required/optional list per [`CHANNEL_DOCTRINE.md`](./CHANNEL_DOCTRINE.md)}
- `surface` matches a route in the surface registry (PR 3d)
- `campaign_id` passes the 9 naming rules in §2
- `voice_key` for the artefact's voice is registered per [`VOICES.md`](./VOICES.md)

Rejections route to the draft state with the validation error attached. Auto-revision can fix `campaign_id` style errors but not semantic mismatches (e.g. wrong channel for cell).

---

## 9. Cross-references

- [`MARKETING_SUPERVISOR.md`](./MARKETING_SUPERVISOR.md) — loop owner of campaign state
- [`ATTRIBUTION.md`](./ATTRIBUTION.md) — UTM capture
- [`CHANNEL_DOCTRINE.md`](./CHANNEL_DOCTRINE.md) — channel validation
- [`VOICES.md`](./VOICES.md) — voice-key validation
- [`ICP_MATRIX.md`](./ICP_MATRIX.md) — `icp` field source
- [`LIFECYCLE.md`](./LIFECYCLE.md) — funnels segment on these tags
- [`KPI_DECOMPOSITION.md`](./KPI_DECOMPOSITION.md) — diagnostics decompose by these tags
- [`packages/email/src/index.ts`](../../packages/email/src/index.ts) — Resend tag binding
- [`packages/crm/src/index.ts`](../../packages/crm/src/index.ts) — `outreach_campaigns.name` alignment
- [`packages/analytics/src/event-schemas.ts`](../../packages/analytics/src/event-schemas.ts) — `factory_events` schema
- [PR 3b — ICP dimension](./pr3-briefs/3b-icp-dimension.md) — table column additions

---

## Version history

| Date | Author | Change |
|------|--------|--------|
| 2026-05-18 | @adrper79-dot (drafted by Claude) | v1 — 5-tuple `(product, icp, channel, surface, campaign_id)` convention; 9 naming rules; state machine; tag propagation across 10 systems; retro template |

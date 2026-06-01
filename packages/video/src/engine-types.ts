// ---------------------------------------------------------------------------
// Energy Blueprint Video Engine — domain types (I1 Slice 0)
//
// Canonical source of truth: docs/architecture/I1_PERSONAL_BLUEPRINT_VIDEO.md
// §2 (domain model). These types are the immutable contract every later slice
// (render service, credit meter, scheduler, social) builds on. New sources and
// fields are additive; existing members are never removed (decisions D1–D13 are
// LOCKED).
// ---------------------------------------------------------------------------

/**
 * A selectable content source that contributes one segment to a composition.
 *
 * Each source maps to a {@link SegmentRenderer} that resolves real user data
 * into render props + narration text. The catalog is additive: new sources
 * extend this union without reshaping existing renders (doc §2, D3).
 *
 * - `blueprint` — the user's Energy Blueprint chart (cacheable).
 * - `transits` — current planetary transits (fresh per render).
 * - `dreamJournal` — dream-journal reflection (fresh per render).
 * - `milestones` — life/practice milestones (fresh per render).
 * - `personality` — psychometric / personality-test results (cacheable).
 */
export type VideoSource =
  | 'blueprint'
  | 'transits'
  | 'dreamJournal'
  | 'milestones'
  | 'personality';

/**
 * The output shape of a render, which affects credit cost (doc §2, D4).
 *
 * - `full_film` — full narrated film.
 * - `short_clip` — abbreviated clip.
 * - `narrated_stills` — narrated still frames (cheapest).
 */
export type VideoFormat = 'full_film' | 'short_clip' | 'narrated_stills';

/**
 * Sharing visibility for a {@link VideoObject}. Personal readings are private
 * first-class assets; sharing is an explicit, consented act (doc §4, D1/D11).
 *
 * - `private` — signed playback only, never indexed (default).
 * - `unlisted` — reachable by link, not listed publicly.
 * - `public` — publicly listed (never the default).
 */
export type ShareVisibility = 'private' | 'unlisted' | 'public';

/**
 * Lifecycle state of a {@link VideoObject} (doc §2).
 *
 * - `requested` — created, not yet metered.
 * - `metered` — credits debited, awaiting enqueue/render.
 * - `rendering` — render service is producing the asset.
 * - `ready` — asset available for signed playback.
 * - `failed` — render failed; credits are refunded.
 */
export type VideoObjectStatus =
  | 'requested'
  | 'metered'
  | 'rendering'
  | 'ready'
  | 'failed';

/**
 * Kind of credit-ledger transaction (doc §2, D4). The ledger itself lives in
 * the selfprime billing domain; this type only names the transaction classes.
 *
 * - `grant` — monthly per-tier allotment.
 * - `debit` — cost of a render, debited atomically at enqueue.
 * - `purchase` — overage credit pack bought via Stripe.
 * - `refund` — credits returned on a failed render.
 */
export type CreditTxnKind = 'grant' | 'debit' | 'purchase' | 'refund';

/**
 * The recipe for a render: which sources, in what format, with brand styling.
 *
 * A composition is modular — each entry in {@link segments} marks whether its
 * source is `cacheable` (static, reusable across renders, e.g. blueprint /
 * personality) or fresh-per-render (e.g. transits, dreamJournal, milestones).
 * This enables source selection and recurring freshness without re-rendering
 * static content (doc §2, D3).
 */
export interface CompositionSpec {
  /** Unique composition-spec identifier (UUID). */
  id: string;
  /** Owning user identifier (UUID). */
  userId: string;
  /** User-selected subset of sources, in catalog order. */
  sources: VideoSource[];
  /** Output format, which influences credit cost. */
  format: VideoFormat;
  /**
   * Ordered segments. Each binds a {@link VideoSource} to whether its rendered
   * output may be cached and reused across renders.
   */
  segments: Array<{ source: VideoSource; cacheable: boolean }>;
  /** Optional brand accent color (hex, e.g. `'#c9a84c'`). */
  brandColor?: string;
  /** Optional brand logo URL. */
  logoUrl?: string;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
}

/**
 * A rendered (or in-flight) personal video asset — one per subscription
 * occurrence or on-demand request (doc §2).
 *
 * Private by default: {@link VideoObject.share}.`visibility` defaults to
 * `'private'`, and playback is via signed Cloudflare Stream URLs (D1).
 */
export interface VideoObject {
  /** Unique video-object identifier (UUID); also the render idempotency key. */
  id: string;
  /** Owning user identifier (UUID). */
  userId: string;
  /** Current lifecycle state. */
  status: VideoObjectStatus;
  /** Human-readable reason when `status === 'failed'`. */
  failureReason?: string;
  /** Identifier of the {@link CompositionSpec} that produced this object. */
  compositionSpecId: string;
  /** Cloudflare Stream UID once the asset is uploaded (private, signed playback). */
  streamUid?: string;
  /** Final duration in seconds, set when `status === 'ready'`. */
  durationS?: number;
  /** Credits debited for this render (refunded on failure). */
  creditsSpent?: number;
  /**
   * Sharing state. `visibility` defaults to `'private'`; the Capricast and
   * Discord fields are populated only after an explicit, consented share.
   */
  share: {
    /** Sharing visibility; defaults to `'private'`. */
    visibility: ShareVisibility;
    /** Capricast video identifier once shared there. */
    capricastVideoId?: string;
    /** ISO 8601 timestamp of a Discord announcement, if any. */
    discordAnnouncedAt?: string;
  };
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** ISO 8601 timestamp when the asset became `ready`. */
  readyAt?: string;
}

/**
 * A standing schedule that produces {@link VideoObject}s on a cadence (doc §2,
 * D5). Zero-to-many per user. The scheduler resolves the spec, gathers fresh
 * source data, meters credits, and enqueues a render on each occurrence.
 */
export interface VideoSubscription {
  /** Unique subscription identifier (UUID). */
  id: string;
  /** Owning user identifier (UUID). */
  userId: string;
  /** Cadence expression (rrule or cron). */
  cadence: string;
  /** The composition recipe rendered on each occurrence. */
  compositionSpec: CompositionSpec;
  /** Delivery channels for produced videos. */
  channels: Array<'in_app' | 'email' | 'sms'>;
  /** Whether the schedule is currently active. */
  active: boolean;
  /** ISO 8601 timestamp of the next scheduled run, if active. */
  nextRunAt?: string;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
}

/**
 * A verified cross-product identity link (selfprime ↔ Capricast ↔ Discord),
 * used for attribution when sharing (doc §2, D12; Slice 5/7).
 */
export interface AccountLink {
  /** Unique link identifier (UUID). */
  id: string;
  /** Owning selfprime user identifier (UUID). */
  userId: string;
  /** External provider this link targets. */
  provider: 'capricast' | 'discord';
  /** The user's identifier on the external provider. */
  externalId: string;
  /** Whether the link has been verified (ownership proven). */
  verified: boolean;
  /** ISO 8601 timestamp the link was established, if verified. */
  linkedAt?: string;
}

/**
 * Moderation state for a shared {@link VideoObject} (doc §2; Slice 7).
 *
 * Shares are auto-screened on submission; flagged content is quarantined and
 * surfaced to the operator's exception queue for review/takedown.
 */
export interface ModerationRecord {
  /** Unique moderation-record identifier (UUID). */
  id: string;
  /** Identifier of the {@link VideoObject} being moderated. */
  videoObjectId: string;
  /** Raw output of the automated screen (shape is screener-defined). */
  autoScreenResult: unknown;
  /** Current moderation state. */
  state: 'ok' | 'flagged' | 'removed';
  /** Identifier of the human actor who set the state, if any. */
  actor?: string;
  /** Human-readable reason for a `flagged` / `removed` state. */
  reason?: string;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Segment interface (doc §7) — the contract every source implements
// ---------------------------------------------------------------------------

/**
 * Input context passed to a {@link SegmentRenderer} for a single source.
 *
 * `sourceData` is intentionally `unknown`: each source owns its own data shape
 * and narrows it internally, keeping this shared contract source-agnostic.
 */
export interface SegmentContext {
  /** Owning user identifier (UUID). */
  userId: string;
  /** Optional profile/chart identifier when a user has multiple profiles. */
  profileId?: string;
  /** The full composition recipe this segment belongs to. */
  spec: CompositionSpec;
  /** Source-specific data, narrowed by the renderer for its own source. */
  sourceData: unknown;
}

/**
 * The resolved output of rendering one source's segment (doc §7).
 *
 * selfprime authors {@link SegmentResult.narrationText} from real source data;
 * Factory never LLM-generates personal narration (D6).
 */
export interface SegmentResult {
  /** Render props handed to the Remotion composition for this segment. */
  props: Record<string, unknown>;
  /** Narration text for this segment (authored by selfprime, not Factory). */
  narrationText: string;
  /** Whether this segment's output may be cached and reused across renders. */
  cacheable: boolean;
}

/**
 * The contract every content source implements (doc §7). Given a source and a
 * {@link SegmentContext}, it resolves the render props + narration for that
 * segment. New sources are additive — adding a renderer never changes existing
 * ones.
 */
export type SegmentRenderer = (
  source: VideoSource,
  ctx: SegmentContext,
) => Promise<SegmentResult>;

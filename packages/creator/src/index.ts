/**
 * @latimer-woods-tech/creator
 *
 * Content creator workflow utilities: scheduling, drafts, and publish queue
 * helpers for creator-facing Factory applications.
 *
 * Designed for Cloudflare Workers — no Node.js built-ins, no Buffer.
 */

// ============================================================================
// TYPES
// ============================================================================

/** Status values for a creator draft in the publishing pipeline. */
export type DraftStatus = 'draft' | 'scheduled' | 'published' | 'archived';

/** Platform targets for published content. */
export type PublishPlatform = 'web' | 'email' | 'social' | 'video';

/**
 * Input shape for creating a new creator draft.
 */
export interface CreatorDraftInput {
  /** Author user ID (opaque string, e.g. Neon UUID). */
  authorId: string;
  /** Human-readable title of the content piece. */
  title: string;
  /** Markdown or plain-text body of the draft. */
  body: string;
  /** Target platforms for this piece of content. */
  platforms: PublishPlatform[];
  /** Optional ISO-8601 datetime string for scheduled publishing. */
  scheduledAt?: string;
}

/**
 * A creator draft — a content piece at any stage of the publish pipeline.
 */
export interface CreatorDraft {
  /** Unique draft ID (8-char alphanumeric). */
  id: string;
  /** Author user ID. */
  authorId: string;
  /** Human-readable title. */
  title: string;
  /** Markdown or plain-text body. */
  body: string;
  /** Target platforms. */
  platforms: PublishPlatform[];
  /** Current lifecycle status. */
  status: DraftStatus;
  /** ISO-8601 datetime when this draft was created. */
  createdAt: string;
  /** ISO-8601 datetime when this draft was last updated. */
  updatedAt: string;
  /** Optional ISO-8601 datetime for scheduled publishing. */
  scheduledAt?: string;
}

/**
 * A publish queue entry — tracks an in-flight or completed publish operation.
 */
export interface PublishQueueEntry {
  /** Unique queue entry ID. */
  id: string;
  /** ID of the draft being published. */
  draftId: string;
  /** Target platform for this entry. */
  platform: PublishPlatform;
  /** Current status: pending, processing, done, or failed. */
  status: 'pending' | 'processing' | 'done' | 'failed';
  /** ISO-8601 datetime when this entry was enqueued. */
  enqueuedAt: string;
  /** Optional error message if status is 'failed'. */
  error?: string;
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Generates an 8-character alphanumeric ID using the Web Crypto API.
 * Safe for use in Cloudflare Workers.
 *
 * @returns An 8-character URL-safe ID string.
 */
export function generateDraftId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes)
    .map((b) => chars[b % chars.length] as string)
    .join('');
}

// ============================================================================
// DRAFT FUNCTIONS
// ============================================================================

/**
 * Creates a new {@link CreatorDraft} from the provided input.
 *
 * This is a pure constructor — it does not persist the draft. Callers are
 * responsible for storing the returned object (e.g. in Neon via `@latimer-woods-tech/neon`).
 *
 * @param input - Draft creation parameters.
 * @returns A fully-populated {@link CreatorDraft} with status `'draft'`.
 *
 * @example
 * ```ts
 * const draft = createDraft({
 *   authorId: 'user_abc123',
 *   title: 'My first post',
 *   body: '# Hello world',
 *   platforms: ['web', 'social'],
 * });
 * ```
 */
export function createDraft(input: CreatorDraftInput): CreatorDraft {
  const now = new Date().toISOString();
  return {
    id: generateDraftId(),
    authorId: input.authorId,
    title: input.title,
    body: input.body,
    platforms: input.platforms,
    status: input.scheduledAt ? 'scheduled' : 'draft',
    createdAt: now,
    updatedAt: now,
    scheduledAt: input.scheduledAt,
  };
}

/**
 * Updates the mutable fields of an existing {@link CreatorDraft}.
 *
 * Returns a new object; does not mutate the original.
 *
 * @param draft - The existing draft to update.
 * @param updates - Partial fields to apply (title, body, platforms, scheduledAt, status).
 * @returns A new {@link CreatorDraft} with the updated fields and a refreshed `updatedAt`.
 */
export function updateDraft(
  draft: CreatorDraft,
  updates: Partial<Pick<CreatorDraft, 'title' | 'body' | 'platforms' | 'scheduledAt' | 'status'>>,
): CreatorDraft {
  return {
    ...draft,
    ...updates,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Enqueues a {@link CreatorDraft} for publishing on all its target platforms.
 *
 * Returns one {@link PublishQueueEntry} per platform. Does not persist — callers
 * store the entries in their own data layer.
 *
 * @param draft - The draft to enqueue.
 * @returns An array of {@link PublishQueueEntry} objects, one per platform.
 */
export function enqueueDraft(draft: CreatorDraft): PublishQueueEntry[] {
  const now = new Date().toISOString();
  return draft.platforms.map((platform) => ({
    id: generateDraftId(),
    draftId: draft.id,
    platform,
    status: 'pending' as const,
    enqueuedAt: now,
  }));
}

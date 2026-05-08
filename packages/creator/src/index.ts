/**
 * @latimer-woods-tech/creator
 * Content creator workflow utilities for Factory applications.
 */

/** Publication status of a creator draft. */
export type CreatorDraftStatus = 'draft' | 'scheduled' | 'published' | 'archived';

/** Input required to create a new creator draft. */
export interface CreatorDraftInput {
  /** The title of the draft. */
  title: string;
  /** Optional body content in markdown. */
  body?: string;
  /** ISO-8601 timestamp for scheduled publication. */
  scheduledAt?: string;
  /** Creator user ID who owns this draft. */
  authorId: string;
}

/** A creator draft record. */
export interface CreatorDraft {
  /** Unique draft identifier. */
  id: string;
  /** Current publication status. */
  status: CreatorDraftStatus;
  /** Draft title. */
  title: string;
  /** Draft body content in markdown. */
  body: string;
  /** Creator user ID who owns this draft. */
  authorId: string;
  /** ISO-8601 creation timestamp. */
  createdAt: string;
  /** ISO-8601 scheduled publication time, or null if not scheduled. */
  scheduledAt: string | null;
}

/**
 * Creates a new draft record from the provided input.
 * Status is set to 'scheduled' when scheduledAt is provided, otherwise 'draft'.
 */
export function createDraft(input: CreatorDraftInput): CreatorDraft {
  const id = `draft_${input.authorId}_${Date.now().toString(36)}`;
  return {
    id,
    status: input.scheduledAt ? 'scheduled' : 'draft',
    title: input.title,
    body: input.body ?? '',
    authorId: input.authorId,
    createdAt: new Date().toISOString(),
    scheduledAt: input.scheduledAt ?? null,
  };
}

/**
 * Returns true if the draft is ready for publication.
 * Requires a non-empty title, non-empty body, and a publishable status (draft or scheduled).
 */
export function isDraftReady(draft: CreatorDraft): boolean {
  return (
    draft.title.trim().length > 0 &&
    draft.body.trim().length > 0 &&
    (draft.status === 'draft' || draft.status === 'scheduled')
  );
}

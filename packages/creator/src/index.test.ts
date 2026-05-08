import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createDraft,
  updateDraft,
  enqueueDraft,
  generateDraftId,
  type CreatorDraftInput,
  type CreatorDraft,
} from './index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const baseInput: CreatorDraftInput = {
  authorId: 'user_001',
  title: 'Test Post',
  body: '# Hello World',
  platforms: ['web', 'social'],
};

// ---------------------------------------------------------------------------
// generateDraftId
// ---------------------------------------------------------------------------

describe('generateDraftId', () => {
  it('returns an 8-character string', () => {
    const id = generateDraftId();
    expect(id).toHaveLength(8);
  });

  it('returns only alphanumeric characters (no ambiguous chars)', () => {
    const id = generateDraftId();
    expect(id).toMatch(/^[A-HJ-NP-Za-hj-np-z2-9]{8}$/);
  });

  it('generates unique IDs on successive calls', () => {
    const ids = new Set(Array.from({ length: 20 }, () => generateDraftId()));
    expect(ids.size).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// createDraft
// ---------------------------------------------------------------------------

describe('createDraft', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T12:00:00.000Z'));
  });

  it('returns a draft with status "draft" when no scheduledAt is provided', () => {
    const draft = createDraft(baseInput);
    expect(draft.status).toBe('draft');
  });

  it('returns a draft with status "scheduled" when scheduledAt is provided', () => {
    const draft = createDraft({ ...baseInput, scheduledAt: '2026-02-01T09:00:00.000Z' });
    expect(draft.status).toBe('scheduled');
    expect(draft.scheduledAt).toBe('2026-02-01T09:00:00.000Z');
  });

  it('populates all required fields', () => {
    const draft = createDraft(baseInput);
    expect(draft.authorId).toBe('user_001');
    expect(draft.title).toBe('Test Post');
    expect(draft.body).toBe('# Hello World');
    expect(draft.platforms).toEqual(['web', 'social']);
    expect(draft.id).toHaveLength(8);
    expect(draft.createdAt).toBe('2026-01-15T12:00:00.000Z');
    expect(draft.updatedAt).toBe('2026-01-15T12:00:00.000Z');
  });

  it('creates a new draft object on each call', () => {
    const d1 = createDraft(baseInput);
    const d2 = createDraft(baseInput);
    // IDs are randomly generated so they should differ
    expect(d1).not.toBe(d2);
  });
});

// ---------------------------------------------------------------------------
// updateDraft
// ---------------------------------------------------------------------------

describe('updateDraft', () => {
  let draft: CreatorDraft;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T12:00:00.000Z'));
    draft = createDraft(baseInput);
    vi.setSystemTime(new Date('2026-01-16T08:30:00.000Z'));
  });

  it('updates the title and refreshes updatedAt', () => {
    const updated = updateDraft(draft, { title: 'New Title' });
    expect(updated.title).toBe('New Title');
    expect(updated.updatedAt).toBe('2026-01-16T08:30:00.000Z');
  });

  it('does not mutate the original draft', () => {
    const originalTitle = draft.title;
    updateDraft(draft, { title: 'New Title' });
    expect(draft.title).toBe(originalTitle);
  });

  it('updates status correctly', () => {
    const updated = updateDraft(draft, { status: 'published' });
    expect(updated.status).toBe('published');
  });

  it('preserves fields not included in updates', () => {
    const updated = updateDraft(draft, { title: 'Changed' });
    expect(updated.body).toBe(draft.body);
    expect(updated.authorId).toBe(draft.authorId);
    expect(updated.id).toBe(draft.id);
  });
});

// ---------------------------------------------------------------------------
// enqueueDraft
// ---------------------------------------------------------------------------

describe('enqueueDraft', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T12:00:00.000Z'));
  });

  it('returns one entry per platform', () => {
    const draft = createDraft(baseInput);
    const entries = enqueueDraft(draft);
    expect(entries).toHaveLength(2);
  });

  it('each entry references the correct draftId', () => {
    const draft = createDraft(baseInput);
    const entries = enqueueDraft(draft);
    for (const entry of entries) {
      expect(entry.draftId).toBe(draft.id);
    }
  });

  it('each entry starts with status "pending"', () => {
    const draft = createDraft(baseInput);
    const entries = enqueueDraft(draft);
    for (const entry of entries) {
      expect(entry.status).toBe('pending');
    }
  });

  it('each entry has a unique ID', () => {
    const draft = createDraft(baseInput);
    const entries = enqueueDraft(draft);
    const ids = new Set(entries.map((e) => e.id));
    expect(ids.size).toBe(entries.length);
  });

  it('entries cover all platforms in the draft', () => {
    const draft = createDraft({ ...baseInput, platforms: ['web', 'email', 'video'] });
    const entries = enqueueDraft(draft);
    const platforms = entries.map((e) => e.platform).sort();
    expect(platforms).toEqual(['email', 'video', 'web']);
  });
});

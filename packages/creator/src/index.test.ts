import { describe, it, expect } from 'vitest';
import { createDraft, isDraftReady } from './index.js';

describe('createDraft', () => {
  it('creates a draft with default status when no scheduledAt', () => {
    const draft = createDraft({ title: 'Hello', authorId: 'user_1' });
    expect(draft.status).toBe('draft');
    expect(draft.title).toBe('Hello');
    expect(draft.scheduledAt).toBeNull();
    expect(draft.id).toMatch(/^draft_user_1_/);
  });

  it('sets scheduled status when scheduledAt is provided', () => {
    const draft = createDraft({
      title: 'Scheduled Post',
      authorId: 'user_1',
      scheduledAt: '2026-06-01T12:00:00Z',
    });
    expect(draft.status).toBe('scheduled');
    expect(draft.scheduledAt).toBe('2026-06-01T12:00:00Z');
  });

  it('defaults body to empty string when not provided', () => {
    const draft = createDraft({ title: 'No Body', authorId: 'user_2' });
    expect(draft.body).toBe('');
  });

  it('preserves body when provided', () => {
    const draft = createDraft({ title: 'With Body', body: 'Some content', authorId: 'user_3' });
    expect(draft.body).toBe('Some content');
  });

  it('sets createdAt to a valid ISO timestamp', () => {
    const draft = createDraft({ title: 'T', authorId: 'u' });
    expect(() => new Date(draft.createdAt)).not.toThrow();
    expect(draft.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('isDraftReady', () => {
  it('returns true for a draft with title and body', () => {
    const draft = createDraft({ title: 'My Post', body: 'Content here', authorId: 'user_1' });
    expect(isDraftReady(draft)).toBe(true);
  });

  it('returns true for a scheduled draft with content', () => {
    const draft = createDraft({
      title: 'Scheduled',
      body: 'Body text',
      authorId: 'user_1',
      scheduledAt: '2026-06-01T12:00:00Z',
    });
    expect(isDraftReady(draft)).toBe(true);
  });

  it('returns false when body is empty', () => {
    const draft = createDraft({ title: 'No Body', authorId: 'user_1' });
    expect(isDraftReady(draft)).toBe(false);
  });

  it('returns false when title is whitespace only', () => {
    const draft = createDraft({ title: 'placeholder', body: 'content', authorId: 'user_1' });
    draft.title = '   ';
    expect(isDraftReady(draft)).toBe(false);
  });

  it('returns false for archived drafts', () => {
    const draft = createDraft({ title: 'Old Post', body: 'content', authorId: 'user_1' });
    draft.status = 'archived';
    expect(isDraftReady(draft)).toBe(false);
  });

  it('returns false for published drafts', () => {
    const draft = createDraft({ title: 'Live Post', body: 'content', authorId: 'user_1' });
    draft.status = 'published';
    expect(isDraftReady(draft)).toBe(false);
  });
});

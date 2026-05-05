import { describe, it, expect } from 'vitest';
import {
  severityFromAuditResult,
  severityFromSentryLevel,
  isTimelineSeverity,
  isTimelineEventKind,
  type TimelineEvent,
  type TimelineQuery,
  type TimelinePage,
} from './timeline.js';

describe('severityFromAuditResult', () => {
  it('maps failure → error', () => {
    expect(severityFromAuditResult('failure')).toBe('error');
  });

  it('maps success → info', () => {
    expect(severityFromAuditResult('success')).toBe('info');
  });

  it('maps dry-run → info', () => {
    expect(severityFromAuditResult('dry-run')).toBe('info');
  });
});

describe('severityFromSentryLevel', () => {
  it('maps fatal and critical → critical', () => {
    expect(severityFromSentryLevel('fatal')).toBe('critical');
    expect(severityFromSentryLevel('critical')).toBe('critical');
  });

  it('maps error → error', () => {
    expect(severityFromSentryLevel('error')).toBe('error');
  });

  it('maps warning and warn → warning', () => {
    expect(severityFromSentryLevel('warning')).toBe('warning');
    expect(severityFromSentryLevel('warn')).toBe('warning');
  });

  it('maps info and unknown strings → info', () => {
    expect(severityFromSentryLevel('info')).toBe('info');
    expect(severityFromSentryLevel('debug')).toBe('info');
    expect(severityFromSentryLevel('')).toBe('info');
  });
});

describe('isTimelineSeverity', () => {
  it('accepts valid severities', () => {
    expect(isTimelineSeverity('info')).toBe(true);
    expect(isTimelineSeverity('warning')).toBe(true);
    expect(isTimelineSeverity('error')).toBe(true);
    expect(isTimelineSeverity('critical')).toBe(true);
  });

  it('rejects invalid values', () => {
    expect(isTimelineSeverity('debug')).toBe(false);
    expect(isTimelineSeverity(null)).toBe(false);
    expect(isTimelineSeverity(42)).toBe(false);
  });
});

describe('isTimelineEventKind', () => {
  it('accepts valid kinds', () => {
    expect(isTimelineEventKind('audit')).toBe(true);
    expect(isTimelineEventKind('incident')).toBe(true);
    expect(isTimelineEventKind('deploy')).toBe(true);
  });

  it('rejects invalid values', () => {
    expect(isTimelineEventKind('log')).toBe(false);
    expect(isTimelineEventKind(undefined)).toBe(false);
  });
});

describe('TimelineEvent type contract', () => {
  it('accepts a minimal audit event', () => {
    const event: TimelineEvent = {
      id: 'e1',
      kind: 'audit',
      occurredAt: '2026-05-01T12:00:00Z',
      env: 'staging',
      severity: 'info',
      title: 'POST /deploys',
    };
    expect(event.kind).toBe('audit');
  });

  it('accepts an incident event with correlation ids', () => {
    const event: TimelineEvent = {
      id: 'sentry-123',
      kind: 'incident',
      occurredAt: '2026-05-01T12:05:00Z',
      env: 'production',
      severity: 'error',
      title: 'TypeError: Cannot read property of undefined',
      requestId: 'req-abc',
      sourceUrl: 'https://sentry.io/issues/123',
    };
    expect(event.sourceUrl).toContain('sentry.io');
    expect(event.requestId).toBe('req-abc');
  });

  it('accepts a deploy event with source and ref', () => {
    const event: TimelineEvent = {
      id: 'deploy-1',
      kind: 'deploy',
      occurredAt: '2026-05-01T11:00:00Z',
      env: 'production',
      severity: 'info',
      title: 'deploy-admin-studio.yml',
      app: 'admin-studio',
      deployRef: 'abc1234',
      sourceUrl: 'https://github.com/Latimer-Woods-Tech/factory/actions/runs/1',
    };
    expect(event.deployRef).toBe('abc1234');
  });
});

describe('TimelineQuery type contract', () => {
  it('supports all filter fields', () => {
    const q: TimelineQuery = {
      env: 'production',
      app: 'wordis-bond',
      severity: 'error',
      actor: 'alice@example.com',
      requestId: 'req-abc',
      sessionId: 'sess-xyz',
      from: '2026-05-01T00:00:00Z',
      to: '2026-05-02T00:00:00Z',
      limit: 50,
      cursor: '2026-05-01T12:00:00Z',
    };
    expect(q.requestId).toBe('req-abc');
    expect(q.sessionId).toBe('sess-xyz');
    expect(q.actor).toBe('alice@example.com');
  });

  it('is fully optional', () => {
    const q: TimelineQuery = {};
    expect(q.limit).toBeUndefined();
  });
});

describe('TimelinePage type contract', () => {
  it('holds events array and nullable cursor', () => {
    const page: TimelinePage = { events: [], nextCursor: null };
    expect(page.nextCursor).toBeNull();
    expect(page.events).toHaveLength(0);
  });
});

import { describe, it, expect } from 'vitest';
import { matchTemplate } from './match.js';
import type { Template } from './load.js';

const TEMPLATES: Template[] = [
  {
    id: 'health-check',
    tier: 'green',
    description: 'Ping health endpoints',
    trigger_keywords: ['health', 'ping', 'status'],
  },
  {
    id: 'deploy',
    tier: 'red',
    description: 'Deploy to prod',
    trigger_keywords: ['deploy', 'ship', 'release'],
  },
  {
    id: 'empty',
    tier: 'green',
    description: 'no keywords',
    trigger_keywords: [],
  },
  {
    id: 'governance-hardening-tweak',
    tier: 'green',
    description:
      'Small governance/hardening additions: workflow tweaks, label additions, README edits, CODEOWNERS updates, branch-policy docs',
    trigger_keywords: ['governance', 'hardening', 'triage', 'flaky', 'reviewer'],
  },
];

describe('matchTemplate', () => {
  it('matches when keywords hit', () => {
    // description hits 'health', 'status', 'ping' — all 3 keywords → score 1.0
    const m = matchTemplate('ping the health status endpoint', TEMPLATES);
    expect(m?.id).toBe('health-check');
  });

  it('returns null when below threshold', () => {
    const m = matchTemplate('something completely unrelated', TEMPLATES);
    expect(m).toBeNull();
  });

  it('prefers green over red on ties', () => {
    const bothMatch: Template[] = [
      { id: 'red-one', tier: 'red', description: '', trigger_keywords: ['foo'] },
      { id: 'green-one', tier: 'green', description: '', trigger_keywords: ['foo'] },
    ];
    const m = matchTemplate('foo', bothMatch);
    expect(m?.tier).toBe('green');
  });

  it('skips templates with no keywords', () => {
    const m = matchTemplate('no keywords', [TEMPLATES[2]!]);
    expect(m).toBeNull();
  });

  it('matches governance-hardening-tweak for branch-protection issues', () => {
    // hits 'hardening' and 'governance' → 2/5 = 0.4 ≥ MIN_SCORE (0.35)
    const m = matchTemplate(
      'gradual branch-protection hardening governance policy promotion',
      TEMPLATES,
    );
    expect(m?.id).toBe('governance-hardening-tweak');
  });

  it('matches governance-hardening-tweak for auto-label triage issues', () => {
    // hits 'triage' and 'governance' → 2/5 = 0.4 ≥ MIN_SCORE (0.35)
    const m = matchTemplate(
      'auto-triage governance label PRs by changed paths and risk',
      TEMPLATES,
    );
    expect(m?.id).toBe('governance-hardening-tweak');
  });

  it('matches governance-hardening-tweak for flaky check reliability issues', () => {
    // hits 'flaky' and 'governance' → 2/5 = 0.4 ≥ MIN_SCORE (0.35)
    const m = matchTemplate(
      'flaky check governance detector with weekly reliability report',
      TEMPLATES,
    );
    expect(m?.id).toBe('governance-hardening-tweak');
  });

  it('matches governance-hardening-tweak for reviewer-class hint issues', () => {
    // hits 'reviewer' and 'governance' → 2/5 = 0.4 ≥ MIN_SCORE (0.35)
    const m = matchTemplate(
      'reviewer governance hints for sensitive path changes via codeowners',
      TEMPLATES,
    );
    expect(m?.id).toBe('governance-hardening-tweak');
  });

  it('prefers governance-hardening-tweak over deploy for hardening governance issues', () => {
    const mixedTemplates: Template[] = [
      { id: 'deploy', tier: 'red', description: '', trigger_keywords: ['drift'] },
      {
        id: 'governance-hardening-tweak',
        tier: 'green',
        description: '',
        trigger_keywords: ['governance', 'hardening', 'drift'],
      },
    ];
    // hits all three governance keywords → score 1.0 (vs deploy score 1/1)
    // tiebreak: green wins over red
    const m = matchTemplate('governance hardening drift fix', mixedTemplates);
    expect(m?.id).toBe('governance-hardening-tweak');
  });

  it('matches template with labels_any_of only when label matches', () => {
    const labelOnly: Template[] = [
      {
        id: 'label-only',
        tier: 'green',
        description: '',
        trigger_keywords: [],
        triggers: { labels_any_of: ['hardening'] },
      },
    ];
    const m = matchTemplate('unrelated description', labelOnly, { labels: ['hardening'] });
    expect(m?.id).toBe('label-only');
  });

  it('does not penalize matching keyword signal when labels_any_of is non-matching but optional to template', () => {
    const templates: Template[] = [
      {
        id: 'keyword-only',
        tier: 'green',
        description: '',
        trigger_keywords: ['governance'],
      },
      {
        id: 'label-and-keyword',
        tier: 'green',
        description: '',
        trigger_keywords: ['governance'],
        triggers: { labels_any_of: ['hardening'] },
      },
    ];

    const m = matchTemplate('governance update', templates, { labels: ['bug'] });
    expect(m?.id).toBe('keyword-only');
  });

  it('matches labels_any_of case-insensitively', () => {
    const templates: Template[] = [
      {
        id: 'case-insensitive-label',
        tier: 'green',
        description: '',
        trigger_keywords: [],
        triggers: { labels_any_of: ['Hardening'] },
      },
    ];
    const m = matchTemplate('something', templates, { labels: ['hardening'] });
    expect(m?.id).toBe('case-insensitive-label');
  });

  it('requires all declared trigger signals to match', () => {
    const templates: Template[] = [
      {
        id: 'strict-triggers',
        tier: 'green',
        description: '',
        trigger_keywords: ['governance'],
        triggers: {
          labels_any_of: ['hardening'],
          title_pattern: 'branch protection',
        },
      },
    ];
    const m = matchTemplate('governance update without title match', templates, { labels: ['hardening'] });
    expect(m).toBeNull();
  });
});

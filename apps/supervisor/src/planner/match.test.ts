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
    triggers: {
      labels_any_of: ['hardening', 'governance', 'chore'],
    },
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

  it('matches via labels signal when issue title has no keywords (Signal 3)', () => {
    // "Triage: Policy Drift Guard 4/10 failures" hits zero keywords,
    // but the 'hardening' label adds +0.5 ≥ MIN_SCORE → should match governance-hardening-tweak
    const m = matchTemplate(
      'Triage: Policy Drift Guard 4/10 failures',
      TEMPLATES,
      ['hardening', 'supervisor:approved-source'],
    );
    expect(m?.id).toBe('governance-hardening-tweak');
  });

  it('labels signal stacks with keyword signal for higher confidence', () => {
    // 'flaky' keyword hits → score 0.2; 'chore' label adds +0.5 → total 0.7
    const m = matchTemplate(
      'flaky policy drift guard check',
      TEMPLATES,
      ['chore'],
    );
    expect(m?.id).toBe('governance-hardening-tweak');
  });

  it('labels signal is case-insensitive', () => {
    const m = matchTemplate(
      'Triage: Policy Drift Guard failures',
      TEMPLATES,
      ['Hardening'],
    );
    expect(m?.id).toBe('governance-hardening-tweak');
  });

  it('does not match via labels when no labels_any_of defined on template', () => {
    // health-check has no triggers.labels_any_of — passing a label does not affect it
    const m = matchTemplate('something unrelated', [TEMPLATES[0]!], ['health']);
    expect(m).toBeNull();
  });

  it('labels signal does not fire when the label is not in labels_any_of', () => {
    // 'bug' is not in governance-hardening-tweak's labels_any_of → no signal
    const m = matchTemplate('Triage: Policy Drift Guard failures', TEMPLATES, ['bug']);
    expect(m).toBeNull();
  });
});

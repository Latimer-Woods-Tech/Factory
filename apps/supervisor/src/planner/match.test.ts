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


  it('matches via labels_any_of when issue label overlaps', () => {
    const labelTemplate: Template[] = [
      {
        id: 'governance-hardening',
        tier: 'green',
        description: 'Governance hardening',
        trigger_keywords: [],
        triggers: { labels_any_of: ['hardening', 'governance', 'chore'] },
      },
    ];
    const m = matchTemplate('some unrelated description', labelTemplate, { labels: ['hardening', 'priority:P1'] });
    expect(m?.id).toBe('governance-hardening');
  });

  it('returns null when labels_any_of present but no label overlap', () => {
    const labelTemplate: Template[] = [
      {
        id: 'governance-hardening',
        tier: 'green',
        description: 'Governance hardening',
        trigger_keywords: [],
        triggers: { labels_any_of: ['hardening', 'governance'] },
      },
    ];
    const m = matchTemplate('some unrelated description', labelTemplate, { labels: ['bug', 'priority:P2'] });
    expect(m).toBeNull();
  });

  it('labels_any_of boosts score above MIN_SCORE even without keyword match', () => {
    const mixed: Template[] = [
      {
        id: 'security-fix',
        tier: 'yellow',
        description: 'Security fix',
        trigger_keywords: ['security', 'cve', 'vuln'],
        triggers: { labels_any_of: ['security'] },
      },
    ];
    // No keywords hit, but label hit adds 0.5 ≥ MIN_SCORE
    const m = matchTemplate('random issue text', mixed, { labels: ['security'] });
    expect(m?.id).toBe('security-fix');
  });
});

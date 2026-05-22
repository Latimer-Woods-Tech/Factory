import { describe, expect, it } from 'vitest';
import { buildEmailHtml } from './email';
import type { BriefInsights } from '../sections/insights';

describe('buildEmailHtml', () => {
  it('escapes dynamic text and neutralizes unsafe links', () => {
    const insights: BriefInsights = {
      narration: '<script>alert("narration")</script>\nLine two',
      textSummary: 'summary',
      todaysFocus: ['Ship <b>safe</b> output'],
      timePerspectives: {
        day: 'Today <tag>',
        week: 'Week & beyond',
        month: 'Month "quote"',
        year: "Year 'apostrophe'",
      },
      winOfTheDay: 'Closed <all> the loops',
    };

    const html = buildEmailHtml({
      dateLabel: 'Friday <May>',
      weather: null,
      news: null,
      activity: null,
      health: null,
      insights,
      audioUrl: 'javascript:alert(1)',
      wisdom: null,
      stripeMrr: null,
      postHog: null,
      sentry: null,
    });

    expect(html).toContain('Friday &lt;May&gt;');
    expect(html).toContain('&lt;script&gt;alert(&quot;narration&quot;)&lt;/script&gt;<br/>Line two');
    expect(html).toContain('Closed &lt;all&gt; the loops');
    expect(html).toContain('Ship &lt;b&gt;safe&lt;/b&gt; output');
    expect(html).toContain('href="#"');
    expect(html).not.toContain('javascript:alert(1)');
    expect(html).not.toContain('<script>alert("narration")</script>');
  });
});
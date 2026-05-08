import { describe, expect, it } from 'vitest';
import { MORE_MOBILE_TABS, PRIMARY_MOBILE_TABS, isMoreTabPath } from './Dashboard.js';

describe('Dashboard mobile navigation', () => {
  it('keeps exactly five primary tabs in usage-priority order', () => {
    expect(PRIMARY_MOBILE_TABS.map((tab) => tab.to)).toEqual([
      '/overview',
      '/ai',
      '/code',
      '/audit',
      '/functions',
    ]);
  });

  it('routes remaining tabs through More', () => {
    expect(MORE_MOBILE_TABS.map((tab) => tab.to)).toEqual(['/tests', '/timeline', '/flags']);
  });

  it('marks More active for nested More routes', () => {
    expect(isMoreTabPath('/tests')).toBe(true);
    expect(isMoreTabPath('/timeline/details')).toBe(true);
    expect(isMoreTabPath('/flags/experiments')).toBe(true);
    expect(isMoreTabPath('/overview')).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { STRATEGIES, getLiveRegionFlushDelayMs, isNearBottom } from './AiTab.js';

describe('AiTab accessibility helpers', () => {
  it('treats chat as sticky when user is within 64px of bottom', () => {
    expect(isNearBottom({ scrollHeight: 1000, scrollTop: 900, clientHeight: 64 })).toBe(true);
    expect(isNearBottom({ scrollHeight: 1000, scrollTop: 800, clientHeight: 100 })).toBe(false);
  });

  it('throttles live-region flushes to 1Hz max', () => {
    expect(getLiveRegionFlushDelayMs(0, 0)).toBe(1000);
    expect(getLiveRegionFlushDelayMs(1000, 1500)).toBe(500);
    expect(getLiveRegionFlushDelayMs(1000, 2200)).toBe(0);
  });

  it('exposes Workbench as the DeepSeek ticket/backlog strategy', () => {
    expect(STRATEGIES).toContainEqual({
      id: 'workbench',
      label: 'Workbench',
      hint: 'DeepSeek-oriented ticket and backlog drafting',
    });
  });
});

import { describe, expect, it, vi } from 'vitest';
import { getKeyboardViewportDelta, isChatLogAtBottom, scrollChatLogToBottom } from './AiTab.js';

describe('AiTab keyboard helpers', () => {
  it('computes visual viewport keyboard delta', () => {
    expect(getKeyboardViewportDelta(900, 640, 0)).toBe(260);
    expect(getKeyboardViewportDelta(900, 920, 0)).toBe(0);
  });

  it('checks if chat log is near bottom', () => {
    const el = {
      scrollHeight: 1000,
      scrollTop: 760,
      clientHeight: 220,
    } as HTMLElement;

    expect(isChatLogAtBottom(el)).toBe(true);
    expect(isChatLogAtBottom({ ...el, scrollTop: 600 } as HTMLElement)).toBe(false);
  });

  it('scrolls chat log to bottom with smooth option', () => {
    const scrollTo = vi.fn();
    const el = { scrollHeight: 777, scrollTo } as unknown as HTMLElement;

    scrollChatLogToBottom(el, true);

    expect(scrollTo).toHaveBeenCalledWith({
      top: 777,
      behavior: 'smooth',
    });
  });
});

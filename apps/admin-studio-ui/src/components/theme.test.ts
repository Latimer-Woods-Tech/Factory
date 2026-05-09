import { describe, expect, it } from 'vitest';
import { resolveInitialTheme } from './theme.js';

describe('resolveInitialTheme', () => {
  it('returns system when no stored value exists', () => {
    expect(resolveInitialTheme(null)).toBe('system');
  });

  it('returns system for invalid values', () => {
    expect(resolveInitialTheme('blue')).toBe('system');
  });

  it('returns supported explicit values', () => {
    expect(resolveInitialTheme('light')).toBe('light');
    expect(resolveInitialTheme('dark')).toBe('dark');
    expect(resolveInitialTheme('system')).toBe('system');
  });
});

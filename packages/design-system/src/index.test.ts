import { describe, it, expect } from 'vitest';
import {
  colors,
  spacing,
  typography,
  shadows,
  borderRadius,
  zIndex,
  transitions,
  breakpoints,
  tokensAsJSON,
} from './index.js';

describe('colors', () => {
  it('exports primary brand color', () => {
    expect(colors.primary).toBe('#0052CC');
  });

  it('exports semantic success color', () => {
    expect(colors.success).toBe('#10B981');
  });

  it('exports surface and text sub-objects', () => {
    expect(typeof colors.surface.base).toBe('string');
    expect(typeof colors.text.primary).toBe('string');
  });
});

describe('spacing', () => {
  it('exports md as 16px', () => {
    expect(spacing.md).toBe('16px');
  });

  it('exports a scale object with numeric keys', () => {
    expect(spacing.scale[4]).toBe('16px');
  });
});

describe('typography', () => {
  it('exports fontFamily with sans-serif base', () => {
    expect(typography.fontFamily.base).toContain('sans-serif');
  });

  it('exports base fontSize as 16px', () => {
    expect(typography.fontSize.base).toBe('16px');
  });

  it('exports h1 style preset', () => {
    expect(typography.styles.h1.fontWeight).toBe(600);
  });
});

describe('shadows', () => {
  it('exports none shadow', () => {
    expect(shadows.none).toBe('none');
  });

  it('exports md shadow as a non-empty string', () => {
    expect(shadows.md.length).toBeGreaterThan(0);
  });
});

describe('borderRadius', () => {
  it('exports full as pill radius', () => {
    expect(borderRadius.full).toBe('9999px');
  });
});

describe('zIndex', () => {
  it('exports modal layer above dropdown', () => {
    expect(zIndex.modal).toBeGreaterThan(zIndex.dropdown);
  });
});

describe('transitions', () => {
  it('exports base duration', () => {
    expect(transitions.duration.base).toBe('200ms');
  });

  it('exports easeInOut timing function', () => {
    expect(transitions.easing.easeInOut).toContain('cubic-bezier');
  });
});

describe('breakpoints', () => {
  it('exports sm breakpoint', () => {
    expect(breakpoints.sm).toBe('640px');
  });
});

describe('tokensAsJSON', () => {
  it('aggregates all token groups', () => {
    expect(tokensAsJSON.colors).toBeDefined();
    expect(tokensAsJSON.spacing).toBeDefined();
    expect(tokensAsJSON.typography).toBeDefined();
    expect(tokensAsJSON.shadows).toBeDefined();
    expect(tokensAsJSON.borderRadius).toBeDefined();
  });
});

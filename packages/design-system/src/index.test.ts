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
  createTheme,
  toCssVar,
  type ThemeMode,
  type ThemeConfig,
} from './index.js';

// ---------------------------------------------------------------------------
// Token shape assertions — these guard against accidental deletion of tokens
// ---------------------------------------------------------------------------

describe('colors', () => {
  it('exports a primary brand color as a hex string', () => {
    expect(colors.primary).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it('exports semantic success/danger/warning/info colors', () => {
    expect(colors.success).toBeTruthy();
    expect(colors.danger).toBeTruthy();
    expect(colors.warning).toBeTruthy();
    expect(colors.info).toBeTruthy();
  });

  it('exports nested text colors', () => {
    expect(colors.text.primary).toBeTruthy();
    expect(colors.text.secondary).toBeTruthy();
    expect(colors.text.inverse).toBeTruthy();
  });

  it('exports nested border colors', () => {
    expect(colors.border.light).toBeTruthy();
    expect(colors.border.default).toBeTruthy();
  });
});

describe('spacing', () => {
  it('exports xs, sm, md, lg, xl, xxl as pixel strings', () => {
    expect(spacing.xs).toBe('4px');
    expect(spacing.sm).toBe('8px');
    expect(spacing.md).toBe('16px');
    expect(spacing.lg).toBe('24px');
    expect(spacing.xl).toBe('32px');
    expect(spacing.xxl).toBe('48px');
  });

  it('exports a numeric scale object', () => {
    expect(spacing.scale[4]).toBe('16px');
    expect(spacing.scale[8]).toBe('32px');
  });
});

describe('typography', () => {
  it('exports font families', () => {
    expect(typography.fontFamily.base).toBeTruthy();
    expect(typography.fontFamily.mono).toBeTruthy();
  });

  it('exports base font size of 16px', () => {
    expect(typography.fontSize.base).toBe('16px');
  });

  it('exports font weights as numbers', () => {
    expect(typeof typography.fontWeight.regular).toBe('number');
    expect(typeof typography.fontWeight.bold).toBe('number');
  });

  it('exports preset text styles', () => {
    expect(typography.styles.h1.fontSize).toBeTruthy();
    expect(typography.styles.body.fontWeight).toBe(400);
  });
});

describe('shadows', () => {
  it('exports none shadow as "none"', () => {
    expect(shadows.none).toBe('none');
  });

  it('exports md shadow as a box-shadow string', () => {
    expect(shadows.md).toContain('rgba');
  });
});

describe('borderRadius', () => {
  it('exports md as 8px', () => {
    expect(borderRadius.md).toBe('8px');
  });

  it('exports full as 9999px (pill shape)', () => {
    expect(borderRadius.full).toBe('9999px');
  });
});

describe('zIndex', () => {
  it('exports modal z-index as 1050', () => {
    expect(zIndex.modal).toBe(1050);
  });

  it('exports hide as -1', () => {
    expect(zIndex.hide).toBe(-1);
  });
});

describe('transitions', () => {
  it('exports base duration as a ms string', () => {
    expect(transitions.duration.base).toBe('200ms');
  });

  it('exports easeInOut as a cubic-bezier string', () => {
    expect(transitions.easing.easeInOut).toContain('cubic-bezier');
  });
});

describe('breakpoints', () => {
  it('exports mobile xs breakpoint as 0px', () => {
    expect(breakpoints.xs).toBe('0px');
  });

  it('exports desktop md breakpoint', () => {
    expect(breakpoints.md).toBeTruthy();
  });
});

describe('tokensAsJSON', () => {
  it('bundles the key token categories', () => {
    expect(tokensAsJSON.colors).toBeDefined();
    expect(tokensAsJSON.spacing).toBeDefined();
    expect(tokensAsJSON.shadows).toBeDefined();
    expect(tokensAsJSON.borderRadius).toBeDefined();
    expect(tokensAsJSON.zIndex).toBeDefined();
    expect(tokensAsJSON.transitions).toBeDefined();
    expect(tokensAsJSON.breakpoints).toBeDefined();
  });

  it('is JSON-serialisable', () => {
    expect(() => JSON.stringify(tokensAsJSON)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// createTheme
// ---------------------------------------------------------------------------

describe('createTheme', () => {
  it('defaults to light mode', () => {
    const theme = createTheme();
    expect(theme.mode).toBe('light');
  });

  it('accepts dark mode', () => {
    const theme = createTheme('dark');
    expect(theme.mode).toBe('dark');
  });

  it('accepts color overrides', () => {
    const theme = createTheme('light', { primary: '#7C3AED' });
    expect(theme.colorOverrides?.primary).toBe('#7C3AED');
  });

  it('returns a ThemeConfig with no overrides when none passed', () => {
    const theme: ThemeConfig = createTheme('system');
    expect(theme.colorOverrides).toBeUndefined();
  });

  it('accepts all ThemeMode values', () => {
    const modes: ThemeMode[] = ['light', 'dark', 'system'];
    for (const mode of modes) {
      const theme = createTheme(mode);
      expect(theme.mode).toBe(mode);
    }
  });
});

// ---------------------------------------------------------------------------
// toCssVar
// ---------------------------------------------------------------------------

describe('toCssVar', () => {
  it('converts a simple token path to a CSS custom property', () => {
    expect(toCssVar('spacing.md')).toBe('--factory-spacing-md');
  });

  it('converts nested paths with multiple dots', () => {
    expect(toCssVar('text.primary')).toBe('--factory-text-primary');
  });

  it('prefixes the result with --factory-', () => {
    const result = toCssVar('colors.primary');
    expect(result.startsWith('--factory-')).toBe(true);
  });

  it('handles single-segment paths with no dot', () => {
    expect(toCssVar('primary')).toBe('--factory-primary');
  });
});

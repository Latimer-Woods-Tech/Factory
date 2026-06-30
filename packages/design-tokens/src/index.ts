/**
 * @latimer-woods-tech/design-tokens
 *
 * Design system tokens for all Factory applications.
 * Includes semantic colors, typography, spacing, motion, and focus styles.
 *
 * All tokens are designed to:
 * - Ensure WCAG 2.2 AA compliance (color contrast, focus visibility)
 * - Support both light and dark modes
 * - Work across all breakpoints
 * - Enable tree-shaking in production builds
 *
 * Usage:
 * ```typescript
 * import { colors, spacing, typography, motion } from '@latimer-woods-tech/design-tokens';
 *
 * const styles = {
 *   color: colors.text.primary,
 *   padding: spacing.md,
 *   fontSize: typography.fontSize.base,
 *   transition: motion.transition.normal,
 * };
 * ```
 */

// Learning Construct denotation standard (tracks · disciplines · levels) — the
// cross-surface visual language shared by the Hub, training videos, and PDFs.
import { learningConstruct } from './learning-construct.js';
export * from './learning-construct.js';

// ============================================================================
// COLOR PALETTE — WCAG 2.2 AA Compliant
// ============================================================================

/**
 * Semantic color tokens for all Factory apps.
 * All colors meet WCAG 2.2 AA standards (4.5:1 contrast minimum for text).
 */
export const colors = {
  // ─────────────────────────────────────────────────────────────────────
  // Semantic Colors (status and intent)
  // ─────────────────────────────────────────────────────────────────────

  /** Primary brand color — use for main CTAs, links, focus states */
  primary: '#0052CC',
  primaryLight: '#E3F2FD',
  primaryDark: '#00309E',

  /** Success — actions completed, validated, approved */
  success: '#10B981',
  successLight: '#D1FAE5',

  /** Error/Danger — errors, destructive actions, failures */
  danger: '#EF4444',
  dangerLight: '#FEE2E2',

  /** Warning — caution, attention needed */
  warning: '#F59E0B',
  warningLight: '#FEF3C7',

  /** Info — informational messages, notices */
  info: '#3B82F6',
  infoLight: '#DBEAFE',

  // ─────────────────────────────────────────────────────────────────────
  // Surface & Background Colors
  // ─────────────────────────────────────────────────────────────────────

  /** Surface colors for containers, backgrounds, layering */
  surface: {
    /** Default page/container background */
    base: '#FFFFFF',
    /** Slightly elevated surfaces (cards, panels) */
    elevated: '#F9FAFB',
    /** Modal overlays, dropdowns */
    overlay: '#F3F4F6',
    /** Darkest surface for highest emphasis */
    base_dark: '#1F2937',
    elevated_dark: '#374151',
    overlay_dark: '#4B5563',
  },

  // ─────────────────────────────────────────────────────────────────────
  // Text Colors (WCAG AA 4.5:1 minimum)
  // ─────────────────────────────────────────────────────────────────────

  text: {
    /** Primary text — highest contrast, body copy */
    primary: '#1F2937',
    /** Secondary text — slightly muted for secondary information */
    secondary: '#6B7280',
    /** Tertiary text — even more muted (form hints, timestamps) */
    tertiary: '#9CA3AF',
    /** Disabled state — intentionally low contrast */
    disabled: '#D1D5DB',
    /** Inverse — text on colored backgrounds */
    inverse: '#FFFFFF',
  },

  // ─────────────────────────────────────────────────────────────────────
  // Border & Divider Colors
  // ─────────────────────────────────────────────────────────────────────

  border: {
    /** Light borders — low emphasis */
    light: '#E5E7EB',
    /** Default borders — standard emphasis */
    default: '#D1D5DB',
    /** Dark borders — high emphasis */
    dark: '#9CA3AF',
  },

  // ─────────────────────────────────────────────────────────────────────
  // Utility Colors
  // ─────────────────────────────────────────────────────────────────────

  white: '#FFFFFF',
  black: '#000000',

  // Grayscale (for neutral backgrounds, disabled states)
  gray: {
    50: '#F9FAFB',
    100: '#F3F4F6',
    200: '#E5E7EB',
    300: '#D1D5DB',
    400: '#9CA3AF',
    500: '#6B7280',
    600: '#4B5563',
    700: '#374151',
    800: '#1F2937',
    900: '#111827',
  },
};

// ============================================================================
// SPACING SCALE — 4px Grid System
// ============================================================================

/**
 * Spacing tokens follow a 4px base grid.
 * Ensures consistent alignment and rhythm across all layouts.
 */
export const spacing = {
  // Named shortcuts
  none: '0px',
  xs: '4px',
  sm: '8px',
  md: '16px',
  lg: '24px',
  xl: '32px',
  xxl: '48px',

  // Numeric scale (4px increments)
  scale: {
    0: '0px',
    1: '4px',
    2: '8px',
    3: '12px',
    4: '16px',
    5: '20px',
    6: '24px',
    7: '28px',
    8: '32px',
    9: '36px',
    10: '40px',
    12: '48px',
    14: '56px',
    16: '64px',
    20: '80px',
    24: '96px',
    28: '112px',
    32: '128px',
  },

  // Common padding/margin combinations
  gutter: '16px', // Side margins on mobile/tablet
  containerPadding: {
    mobile: '16px',
    tablet: '24px',
    desktop: '32px',
  },
};

// ============================================================================
// TYPOGRAPHY
// ============================================================================

/**
 * Typography tokens for consistent text rendering across all apps.
 */
export const typography = {
  // Font families
  fontFamily: {
    /** Default system font stack */
    sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif',
    /** Monospace for code examples */
    mono: '"SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas, "Courier New", monospace',
  },

  // Font sizes
  fontSize: {
    xs: '12px',
    sm: '14px',
    base: '16px',
    lg: '18px',
    xl: '20px',
    '2xl': '24px',
    '3xl': '30px',
    '4xl': '36px',
  },

  // Font weights
  fontWeight: {
    light: 300,
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },

  // Line heights
  lineHeight: {
    tight: 1.2,
    snug: 1.375,
    normal: 1.5,
    relaxed: 1.625,
    loose: 2,
  },

  // Letter spacing
  letterSpacing: {
    tight: '-0.02em',
    normal: '0em',
    wide: '0.05em',
  },

  // Preset text styles (combine multiple properties)
  preset: {
    // Headings
    h1: {
      fontSize: '36px',
      fontWeight: 600,
      lineHeight: 1.2,
      letterSpacing: '-0.02em',
    },
    h2: {
      fontSize: '30px',
      fontWeight: 600,
      lineHeight: 1.2,
      letterSpacing: '-0.02em',
    },
    h3: {
      fontSize: '24px',
      fontWeight: 600,
      lineHeight: 1.25,
    },
    h4: {
      fontSize: '20px',
      fontWeight: 600,
      lineHeight: 1.3,
    },
    h5: {
      fontSize: '18px',
      fontWeight: 600,
      lineHeight: 1.4,
    },
    h6: {
      fontSize: '16px',
      fontWeight: 600,
      lineHeight: 1.4,
    },

    // Body text
    body: {
      fontSize: '16px',
      fontWeight: 400,
      lineHeight: 1.5,
    },
    bodySmall: {
      fontSize: '14px',
      fontWeight: 400,
      lineHeight: 1.5,
    },
    bodyLarge: {
      fontSize: '18px',
      fontWeight: 400,
      lineHeight: 1.6,
    },

    // UI text
    label: {
      fontSize: '14px',
      fontWeight: 500,
      lineHeight: 1.4,
    },
    button: {
      fontSize: '16px',
      fontWeight: 600,
      lineHeight: 1.4,
    },

    // Supporting text
    caption: {
      fontSize: '12px',
      fontWeight: 400,
      lineHeight: 1.4,
    },
    hint: {
      fontSize: '12px',
      fontWeight: 400,
      lineHeight: 1.4,
      letterSpacing: '0.05em',
    },
  },
};

// ============================================================================
// MOTION & ANIMATION
// ============================================================================

/**
 * Motion tokens for consistent animations and transitions.
 * Respects prefers-reduced-motion for accessibility.
 */
export const motion = {
  // Duration (milliseconds)
  duration: {
    fastest: '75ms',
    faster: '100ms',
    fast: '150ms',
    normal: '300ms',
    slow: '500ms',
    slower: '700ms',
  },

  // Easing functions
  easing: {
    /** Linear — equal velocity throughout */
    linear: 'linear',
    /** Ease in — starts slow, accelerates */
    in: 'cubic-bezier(0.4, 0, 1, 1)',
    /** Ease out — starts fast, decelerates */
    out: 'cubic-bezier(0, 0, 0.2, 1)',
    /** Ease in-out — slow start and end, fast middle */
    inOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
  },

  // Preset transitions (CSS format)
  transition: {
    fast: 'all 150ms cubic-bezier(0.4, 0, 0.2, 1)',
    normal: 'all 300ms cubic-bezier(0.4, 0, 0.2, 1)',
    slow: 'all 500ms cubic-bezier(0.4, 0, 0.2, 1)',

    // Property-specific transitions
    color: 'color 300ms cubic-bezier(0.4, 0, 0.2, 1)',
    shadow: 'box-shadow 300ms cubic-bezier(0.4, 0, 0.2, 1)',
    transform: 'transform 300ms cubic-bezier(0.4, 0, 0.2, 1)',
  },

  // Reduced motion (accessibility)
  reducedMotion: '(prefers-reduced-motion: reduce)',
};

// ============================================================================
// FOCUS STYLES — WCAG 2.4.7 Compliance
// ============================================================================

/**
 * Focus styles for keyboard navigation.
 * Meets WCAG 2.4.7 requirements (minimum 3px outline, 3:1 contrast).
 */
export const focus = {
  // Focus ring styles (for all interactive elements)
  ring: {
    /** Outline width (pixels) */
    width: '3px',
    /** Outline offset (pixels) */
    offset: '2px',
    /** Color (uses primary brand color with transparency) */
    color: 'rgba(0, 82, 204, 0.68)',
  },

  // CSS classes for common use
  CSS: {
    /** Outline style for buttons, links, form controls */
    outline: 'outline: 3px solid rgba(0, 82, 204, 0.68); outline-offset: 2px;',
    /** Remove default browser focus (use with custom focus) */
    none: 'outline: none;',
  },
};

// ============================================================================
// BREAKPOINTS — Responsive Design
// ============================================================================

/**
 * Breakpoints for responsive layouts.
 * Mobile-first design approach.
 */
export const breakpoints = {
  // Named breakpoints
  mobile: '375px',
  tablet: '768px',
  desktop: '1024px',
  wide: '1440px',

  // Numeric scale (pixels)
  scale: {
    xs: '320px',
    sm: '375px',
    md: '768px',
    lg: '1024px',
    xl: '1440px',
    '2xl': '1920px',
  },

  // Media query helpers
  media: {
    mobile: '@media (min-width: 375px)',
    tablet: '@media (min-width: 768px)',
    desktop: '@media (min-width: 1024px)',
    wide: '@media (min-width: 1440px)',
  },
};

// ============================================================================
// DENSITY — Compact vs. Spacious Layouts
// ============================================================================

/**
 * Density tokens for adapting UI to different contexts.
 * Compact for dense dashboards, spacious for simple journeys.
 */
export const density = {
  // Padding presets for buttons, inputs, etc.
  compact: {
    padding: '8px 12px', // Smaller hit target
    minHeight: '32px',
  },
  normal: {
    padding: '12px 16px', // Standard hit target
    minHeight: '40px',
  },
  spacious: {
    padding: '16px 20px', // Larger hit target
    minHeight: '48px',
  },

  // Gap presets for grids, flex layouts
  gap: {
    compact: '8px',
    normal: '16px',
    spacious: '24px',
  },
};

// ============================================================================
// SHADOWS — Depth and Elevation
// ============================================================================

/**
 * Shadow tokens for creating depth and visual hierarchy.
 */
export const shadows = {
  // Elevation shadows (Material Design inspired)
  none: 'none',
  xs: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  sm: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
  md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
  lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
  xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',

  // Focus shadow (for focus visible state)
  focus: '0 0 0 3px rgba(0, 82, 204, 0.68)',
};

// ============================================================================
// RADII — Border Radius
// ============================================================================

/**
 * Border radius tokens for consistent rounded corners.
 */
export const radii = {
  none: '0px',
  xs: '2px',
  sm: '4px',
  md: '6px',
  lg: '8px',
  xl: '12px',
  '2xl': '16px',
  full: '9999px', // For pills, circles
};

// ============================================================================
// EXPORT ALL TOKENS AS SINGLE OBJECT (for convenience)
// ============================================================================

export const tokens = {
  colors,
  spacing,
  typography,
  motion,
  focus,
  breakpoints,
  density,
  shadows,
  radii,
  learningConstruct,
} as const;

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default tokens;

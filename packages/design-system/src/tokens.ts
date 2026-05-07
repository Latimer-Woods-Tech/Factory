/**
 * Factory Design System — Design Tokens
 * 
 * These tokens are the foundation of all UI in Factory applications.
 * Export as TypeScript module for type safety and tree-shaking.
 * 
 * Usage in apps:
 * ```tsx
 * import { colors, spacing, typography } from '@latimer-woods-tech/design-system';
 * 
 * const buttonStyles = {
 *   backgroundColor: colors.primary,
 *   padding: spacing.md,
 *   fontSize: typography.fontSize.base,
 * };
 * ```
 * 
 * Export as JSON for use in CSS/Tailwind:
 * ```json
 * {
 *   "colors": { "primary": "#0052CC", ... },
 *   "spacing": { "xs": "4px", ... }
 * }
 * ```
 */

// ============================================================================
// COLOR PALETTE
// ============================================================================

/** Brand, semantic, neutral and surface color palette for all Factory UI. */
export const colors = {
  // Brand Colors
  primary: '#0052CC',           // Core blue — primary actions, links, focus states
  primaryLight: '#E3F2FD',      // Light blue — backgrounds, hover states
  primaryDark: '#00309E',       // Dark blue — pressed states, dark mode
  
  secondary: '#FF6600',         // Accent orange — highlights, badges (optional)
  secondaryLight: '#FFF3E0',    // Light orange
  secondaryDark: '#E65100',     // Dark orange
  
  // Semantic Colors
  success: '#10B981',           // Green — approved, validated, positive
  successLight: '#D1FAE5',     
  danger: '#EF4444',            // Red — errors, destructive actions
  dangerLight: '#FEE2E2',
  warning: '#F59E0B',           // Amber — warnings, cautions
  warningLight: '#FEF3C7',
  info: '#3B82F6',              // Blue — informational, notices
  infoLight: '#DBEAFE',
  
  // Neutral/Grayscale
  white: '#FFFFFF',
  black: '#000000',
  
  // Surface Colors (backgrounds, containers)
  surface: {
    base: '#FFFFFF',            // Default background
    elevated: '#F9FAFB',        // Slightly elevated container
    overlay: '#F3F4F6',         // Overlay, modal backgrounds
  },
  
  // Text Colors
  text: {
    primary: '#1F2937',         // High contrast text (WCAG AA)
    secondary: '#6B7280',       // Muted text, secondary information
    tertiary: '#9CA3AF',        // Even more muted (form hints)
    disabled: '#D1D5DB',        // Disabled text (low contrast, intentional)
    inverse: '#FFFFFF',         // Text on dark backgrounds
  },
  
  // Border/Divider
  border: {
    light: '#E5E7EB',           // Light borders
    default: '#D1D5DB',         // Standard borders
    dark: '#9CA3AF',            // Darker borders (more emphasis)
  },
};

// ============================================================================
// SPACING SCALE (4px Grid)
// ============================================================================

/** 4px-grid spacing scale used for padding, margin, and gap values. */
export const spacing = {
  // Base unit: 4px (follow 4px grid system for consistency)
  xs: '4px',
  sm: '8px',
  md: '16px',
  lg: '24px',
  xl: '32px',
  xxl: '48px',
  
  // Shortcuts for common patterns
  none: '0px',
  auto: 'auto',
  
  // Allow access by scale
  scale: {
    1: '4px',
    2: '8px',
    3: '12px',    // For custom spacing
    4: '16px',
    5: '20px',    // For custom spacing
    6: '24px',
    7: '28px',    // For custom spacing
    8: '32px',
    10: '40px',   // For custom spacing
    12: '48px',
  },
};

// ============================================================================
// TYPOGRAPHY
// ============================================================================

/** Font families, sizes, weights, and line heights for all Factory text styles. */
export const typography = {
  // Font Families
  fontFamily: {
    base: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif',
    mono: '"SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas, "Courier New", monospace',
  },
  
  // Font Sizes
  fontSize: {
    xs: '12px',     // Smallest; use sparingly (captions, small text)
    sm: '14px',     // Small text (hints, secondary info)
    base: '16px',   // Default; body text
    lg: '18px',     // Large body text
    xl: '20px',     // Large headings
    '2xl': '24px',  // Extra large headings
    '3xl': '30px',  // Hero headings
    '4xl': '36px',  // Page titles
  },
  
  // Font Weights
  fontWeight: {
    light: 300,
    regular: 400,
    medium: 500,    // For emphasis (labels, button text)
    semibold: 600,  // For strong emphasis (headings)
    bold: 700,      // Rarely used; prefer semibold
  },
  
  // Line Heights
  lineHeight: {
    tight: 1.2,     // Headings (compact)
    normal: 1.5,    // Body text (readable)
    relaxed: 1.75,  // Long-form text (more breathing room)
  },
  
  // Letter Spacing
  letterSpacing: {
    tight: '-0.02em',   // Headings (slightly tighter)
    normal: '0em',      // Default
    wide: '0.05em',     // All caps, labels (more breathing room)
  },
  
  // Preset Text Styles (combine multiple properties)
  styles: {
    // Heading presets
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
      lineHeight: 1.2,
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
    
    // Body text presets
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
    
    // Label presetsΕ
    label: {
      fontSize: '14px',
      fontWeight: 500,
      lineHeight: 1.4,
    },
    labelSmall: {
      fontSize: '12px',
      fontWeight: 500,
      lineHeight: 1.4,
    },
    
    // Hint/caption (secondary text)
    hint: {
      fontSize: '12px',
      fontWeight: 400,
      lineHeight: 1.4,
      color: colors.text.secondary,
    },
    
    // Button text
    button: {
      fontSize: '16px',
      fontWeight: 500,
      lineHeight: 1.4,
      letterSpacing: 'normal',
    },
    buttonSmall: {
      fontSize: '14px',
      fontWeight: 500,
      lineHeight: 1.3,
    },
  },
};

// ============================================================================
// SHADOWS
// ============================================================================

/** Box shadow elevation scale — from none to xl for depth layering. */
export const shadows = {
  // Elevation shadows (increasing depth)
  none: 'none',
  
  xs: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  sm: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
  md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
  lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
  xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
  '2xl': '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
  
  // Focus ring shadow (accessibility)
  focus: '0 0 0 3px rgba(0, 82, 204, 0.1)',
  
  // Inset shadows (for pressed states)
  inset: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.05)',
};

// ============================================================================
// BORDER RADIUS
// ============================================================================

/** Border radius scale — from sharp (none) to pill (full). */
export const borderRadius = {
  none: '0px',
  sm: '4px',                // Slight rounding (minor elements)
  md: '8px',                // Standard rounding (buttons, inputs)
  lg: '12px',               // Larger rounding (cards, modals)
  xl: '16px',               // Extra rounding (featured containers)
  full: '9999px',           // Fully rounded (pills, badges)
};

// ============================================================================
// Z-INDEX SCALE
// ============================================================================

/** CSS z-index stacking scale — from hidden (-1) to toast (1070). */
export const zIndex = {
  // Layer ordering (CSS z-index values)
  hide: -1,                 // Hidden
  base: 0,                  // Default stacking context
  docked: 10,               // Sticky headers, fixed sidebars
  dropdown: 1000,           // Dropdowns, popovers
  sticky: 1020,             // Sticky elements above dropdowns
  fixed: 1030,              // Fixed elements
  offcanvas: 1040,          // Offcanvas panels
  modal: 1050,              // Modal backdrops
  popover: 1060,            // Popover windows (above modals)
  tooltip: 1070,            // Tooltips (highest)
};

// ============================================================================
// TRANSITIONS / ANIMATIONS
// ============================================================================

/** CSS transition durations and timing functions for consistent animation. */
export const transitions = {
  // Duration (milliseconds)
  duration: {
    fast: '150ms',
    base: '200ms',
    slow: '300ms',
    slower: '500ms',
  },
  
  // Easing functions
  easing: {
    linear: 'linear',
    ease: 'ease',
    easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
    easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
    easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
  },
};

// ============================================================================
// BREAKPOINTS (Responsive Design)
// ============================================================================

/** Responsive breakpoint values for media queries. */
export const breakpoints = {
  xs: '0px',                // Mobile
  sm: '640px',              // Tablet
  md: '1024px',             // Desktop
  lg: '1280px',             // Large desktop
  xl: '1536px',             // Extra large
};

// ============================================================================
// EXPORT AS JSON
// ============================================================================

/**
 * For use in Tailwind config, CSS variables, or static export:
 * 
 * ```typescript
 * import tokens from './tokens.ts';
 * 
 * const tokensJSON = JSON.stringify(tokens);
 * fs.writeFileSync('tokens.json', tokensJSON);
 * ```
 */

export const tokensAsJSON = {
  colors,
  spacing,
  typography: {
    fontFamily: typography.fontFamily,
    fontSize: typography.fontSize,
    fontWeight: typography.fontWeight,
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing,
  },
  shadows,
  borderRadius,
  zIndex,
  transitions,
  breakpoints,
};

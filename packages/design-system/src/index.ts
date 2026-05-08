/**
 * @latimer-woods-tech/design-system
 *
 * Design tokens and shared UI primitives for Factory applications.
 * Exports typed constants for colors, spacing, typography, shadows,
 * border radius, z-index, transitions, and breakpoints.
 *
 * Tree-shakeable ESM — import only what you need.
 *
 * @example
 * ```ts
 * import { colors, spacing, typography } from '@latimer-woods-tech/design-system';
 *
 * const style = {
 *   color: colors.text.primary,
 *   padding: spacing.md,
 *   fontSize: typography.fontSize.base,
 * };
 * ```
 */

// Re-export all design tokens defined in tokens.ts
export {
  colors,
  spacing,
  typography,
  shadows,
  borderRadius,
  zIndex,
  transitions,
  breakpoints,
  tokensAsJSON,
} from './tokens.js';

// ============================================================================
// THEME TYPES
// ============================================================================

/**
 * A named theme variant — used to switch between light and dark modes.
 */
export type ThemeMode = 'light' | 'dark' | 'system';

/**
 * A complete theme configuration bundling mode with optional overrides.
 */
export interface ThemeConfig {
  /** The active color mode. */
  mode: ThemeMode;
  /**
   * Optional color overrides — keys must match top-level keys in the
   * {@link colors} object from tokens.
   */
  colorOverrides?: Partial<{
    primary: string;
    secondary: string;
    success: string;
    danger: string;
    warning: string;
    info: string;
  }>;
}

// ============================================================================
// THEME HELPERS
// ============================================================================

/**
 * Creates a {@link ThemeConfig} with sensible defaults.
 *
 * @param mode - The color mode to use. Defaults to `'light'`.
 * @param colorOverrides - Optional brand color overrides.
 * @returns A fully-typed {@link ThemeConfig} object.
 *
 * @example
 * ```ts
 * const theme = createTheme('dark', { primary: '#7C3AED' });
 * ```
 */
export function createTheme(
  mode: ThemeMode = 'light',
  colorOverrides?: ThemeConfig['colorOverrides'],
): ThemeConfig {
  return { mode, colorOverrides };
}

/**
 * Resolves a CSS custom-property name from a token path.
 *
 * Converts dot-separated token paths (e.g. `text.primary`) to CSS variable
 * names following the Factory convention: `--factory-{path}` with dots
 * replaced by hyphens.
 *
 * @param tokenPath - Dot-separated path into the token object (e.g. `'spacing.md'`).
 * @returns CSS custom property name (e.g. `'--factory-spacing-md'`).
 *
 * @example
 * ```ts
 * toCssVar('spacing.md');   // '--factory-spacing-md'
 * toCssVar('text.primary'); // '--factory-text-primary'
 * ```
 */
export function toCssVar(tokenPath: string): string {
  return `--factory-${tokenPath.replace(/\./g, '-')}`;
}

/**
 * Application Design System Theme  —  v2.0  (Phase 1 Global Overhaul)
 *
 * Centralizes all design tokens (colors, typography, spacing, shadows, etc.)
 * so that our UI is consistent and easy to update in one place.
 *
 * USAGE:
 * import theme, { lightThemeColors, darkThemeColors, typography, spacing, radii, shadows, transitions, makeStyles } from '../styles/theme';
 *
 * // Example using the default export object:
 * const myStyle = {
 *   backgroundColor: theme.colors.cards,
 *   padding: theme.spacing[4],
 *   borderRadius: theme.radii.md
 * };
 *
 * // Example using the makeStyles helper:
 * const styles = makeStyles((t) => ({
 *   container: {
 *     background: t.colors.background,
 *     color: t.colors.textPrimary,
 *     padding: t.spacing[6],
 *     borderRadius: t.radii.lg,
 *     boxShadow: t.shadows.md,
 *     transition: `all ${t.transitions.base}`
 *   }
 * }));
 */

/* ─── Dark Theme Colors ────────────────────────────────────────────────────── */
export const darkThemeColors = {
  // Surfaces
  background: '#0b0e14',        // Deep ink black – premium feel
  cards:      '#12161f',        // Slightly lifted card surface
  borders:    '#1e2533',        // Subtle border, low-contrast

  // Brand & semantic
  accent:  '#F59E0B',           // Warm amber – vivid but not neon
  primary: '#F59E0B',
  success: '#34D399',           // Minty green – modern & accessible
  error:   '#F87171',           // Soft red – high contrast on dark
  danger:  '#F87171',
  info:    '#60A5FA',           // Bright sky blue

  // Text – WCAG AAA hierarchy
  textPrimary:   '#F1F5F9',     // Near-white – max contrast
  textSecondary: '#94A3B8',     // Muted slate
  textMuted:     '#64748B',     // De-emphasized
  textFaint:     '#475569',     // Ghost text / placeholder

  // Utility
  overlay:  'rgba(11, 14, 20, 0.85)',
  skeleton: '#1a1f2e',
};

/* ─── Light Theme Colors ───────────────────────────────────────────────────── */
export const lightThemeColors = {
  // Surfaces
  background: '#F8FAFC',        // Cool off-white
  cards:      '#FFFFFF',        // Pure white cards
  borders:    '#E2E8F0',        // Soft slate border

  // Brand & semantic — slightly deepened for white-bg contrast
  accent:  '#D97706',
  primary: '#D97706',
  success: '#16A34A',
  error:   '#DC2626',
  danger:  '#DC2626',
  info:    '#2563EB',

  // Text – WCAG AAA hierarchy
  textPrimary:   '#0F172A',
  textSecondary: '#334155',
  textMuted:     '#64748B',
  textFaint:     '#94A3B8',

  // Utility
  overlay:  'rgba(248, 250, 252, 0.85)',
  skeleton: '#E2E8F0',
};

// Backward-compat default export
export const colors = darkThemeColors;

/* ─── Typography ───────────────────────────────────────────────────────────── */
export const typography = {
  fontFamily: "'Plus Jakarta Sans', 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif",
  sizes: {
    xs:   '0.75rem',    // 12px
    sm:   '0.8125rem',  // 13px  — tighter small text
    base: '0.9375rem',  // 15px  — slightly larger for readability
    lg:   '1.0625rem',  // 17px
    xl:   '1.25rem',    // 20px
    '2xl': '1.5rem',    // 24px
    '3xl': '1.875rem',  // 30px
    '4xl': '2.25rem',   // 36px
  },
  weights: {
    normal:    400,
    medium:    500,
    semibold:  600,
    bold:      700,
    extrabold: 800,
  },
};

/* ─── Spacing (4px scale) ──────────────────────────────────────────────────── */
export const spacing = {
  0:   '0px',
  0.5: '2px',
  1:   '4px',
  1.5: '6px',
  2:   '8px',
  2.5: '10px',
  3:   '12px',
  3.5: '14px',
  4:   '16px',
  5:   '20px',
  6:   '24px',
  7:   '28px',
  8:   '32px',
  9:   '36px',
  10:  '40px',
  12:  '48px',
  16:  '64px',
  20:  '80px',
  24:  '96px',
};

/* ─── Border Radii — softer, modern rounded shapes ─────────────────────────── */
export const radii = {
  none: '0px',
  sm:   '10px',
  md:   '14px',
  lg:   '18px',
  xl:   '24px',
  '2xl': '32px',
  full: '9999px',
};

/* ─── Shadows — diffused, layered, modern ──────────────────────────────────── */
export const shadows = {
  none: 'none',
  sm:   '0 1px 2px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.08)',
  md:   '0 2px 4px rgba(0,0,0,0.04), 0 6px 14px rgba(0,0,0,0.08), 0 12px 24px rgba(0,0,0,0.06)',
  lg:   '0 4px 8px rgba(0,0,0,0.04), 0 10px 24px rgba(0,0,0,0.10), 0 20px 48px rgba(0,0,0,0.08)',
  xl:   '0 8px 16px rgba(0,0,0,0.06), 0 20px 40px rgba(0,0,0,0.12), 0 32px 64px rgba(0,0,0,0.10)',
  glow: '0 0 20px rgba(245, 158, 11, 0.18), 0 0 40px rgba(245, 158, 11, 0.08)',
};

/* ─── Transitions ──────────────────────────────────────────────────────────── */
export const transitions = {
  fast: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
  base: '250ms cubic-bezier(0.4, 0, 0.2, 1)',
  slow: '400ms cubic-bezier(0.4, 0, 0.2, 1)',
};

/* ─── Combined Theme Object ────────────────────────────────────────────────── */
const theme = {
  colors: darkThemeColors,   // Default to dark theme
  typography,
  spacing,
  radii,
  shadows,
  transitions,
};

export default theme;

/**
 * Helper to generate stylesheet objects dynamically with access to the theme.
 *
 * @param {Function} styleFn - A function that takes the theme object and returns a styles object.
 * @returns {Object} The evaluated styles object.
 */
export const makeStyles = (styleFn) => {
  return styleFn(theme);
};

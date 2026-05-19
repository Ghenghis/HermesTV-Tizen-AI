/**
 * Hermes shared design tokens.
 *
 * Pure ES module — no React, no JSX, no CSS imports. Every shell, modal, and
 * component imports from here so radii, shadows, gradients, easings, and
 * durations stay consistent across the seven layout shells and 14 modals.
 *
 * Values reference CSS custom properties (--accent, --surface, --bg, --border)
 * with literal fallbacks so the tokens still work in isolated previews or
 * during the initial render before the theme class lands on <body>.
 *
 * Tizen 6.5 / Chrome 76 safe — no CSS Houdini, no @container, no :has().
 */

export const RADII = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 9999,
};

export const SHADOWS = {
  sm: '0 2px 6px rgba(0,0,0,0.18)',
  md: '0 6px 18px rgba(0,0,0,0.28)',
  lg: '0 12px 36px rgba(0,0,0,0.42)',
  xl: '0 20px 60px rgba(0,0,0,0.55)',
  focus: '0 0 0 3px var(--accent, #00d4ff), 0 12px 36px rgba(0,212,255,0.35)',
  glass: '0 8px 32px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06)',
};

export const GRADIENTS = {
  accent: 'linear-gradient(135deg, var(--accent, #00d4ff), #6366f1)',
  warm: 'linear-gradient(135deg, #f59e0b, #ef4444)',
  sunset: 'linear-gradient(135deg, #6366f1, #d946ef)',
  surfaceTop: 'linear-gradient(180deg, var(--surface, #161b22), var(--bg, #0d1117))',
};

export const EASE = {
  // Smooth ease-out — the modern, decelerating feel for entrances + hover.
  out: 'cubic-bezier(0.16, 1, 0.3, 1)',
  // Symmetric ease-in-out — for transitions that should feel balanced.
  inOut: 'cubic-bezier(0.65, 0, 0.35, 1)',
  // Tiny overshoot — for chips, badges, and other "snap into place" UI.
  spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
};

export const DURATION = {
  fast: 120,
  base: 200,
  slow: 320,
  modal: 220,
};

export const BORDERS = {
  default: '1px solid var(--border, rgba(255,255,255,0.08))',
  raised: '1px solid rgba(255,255,255,0.12)',
  focus: '2px solid var(--accent, #00d4ff)',
};

export const SPACE = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  7: 32,
  8: 40,
};

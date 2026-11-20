// Base-4 scale (pt). Values come from "Desvíos del Figma" in MEMORY.md.
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
} as const;

// Side margin of every screen.
export const screenMargin = spacing.xl;

// The Figma does not define radii: these are fixed by spec 001. `pill` is a radius large
// enough to fully round any control (kept as a multiple of 4 like the rest).
export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 1000,
} as const;

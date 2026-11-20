// System font on purpose (no fontFamily): it follows the platform and scales with the
// system font size. 12 pt is the floor for any text.
export const typography = {
  sizes: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 20,
    xl: 24,
    xxl: 32,
  },
  weights: {
    regular: "400",
    semibold: "600",
    bold: "700",
  },
} as const;

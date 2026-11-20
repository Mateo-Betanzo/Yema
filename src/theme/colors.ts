// Values come from "Desvíos del Figma" in MEMORY.md; contrast is checked in tests/theme.test.ts.
export const colors = {
  primary: "#d73402",
  primaryPressed: "#b82c03",
  primaryGradientEnd: "#a82a05",
  // Spec 007: the dark bars and chips on the orange "Ventas por tipo" card of the Figma (white text 9.82:1).
  primaryShade: "#7a2810",
  accent: "#6d5bf6",
  // White: text on filled backgrounds and on the dark surfaces.
  text: "#ffffff",
  // Black: the top of the Welcome gradient, its "Crear cuenta" button and the text of its white button.
  black: "#000000",
  textSecondary: "#8f8f94",
  link: "#a99dff",
  // The cards: the Figma's #222222 since 2026-11-19 (was #26252c); white 15.91:1, textSecondary 4.94:1.
  surface: "#222222",
  // Spec 005, cambio del 2026-11-19: the rows of "Próximos" in the admin Home, as the Figma (white 10.9:1).
  rowMuted: "#3b3b3b",
  overlay: "#17171b",
  // Behind a modal (the product detail): black at 70 %, so the card stands out and the screen stays hinted.
  scrim: "rgba(0, 0, 0, 0.7)",
  // Flat dark background; it is also the top of the background gradient.
  canvas: "#121116",
  backgroundGradient: { top: "#121116", bottom: "#000000" },
  // Border of the black fields: the Figma's #3b3b3b gives 1.87:1 on black, so it is lightened to 3:1.
  fieldBorder: "#5a5a5a",
  // Spec 012: the moving border of the "Resumen del día" card (violet, blue, pink; each 3:1 or more on overlay).
  aiGlow: ["#6d5bf6", "#4c8dff", "#e879c9"],
  // Ordered palette assigned to each egg type; always shown with a text label.
  categories: ["#d73402", "#6d5bf6", "#c9c0ff", "#f2b84b"],
} as const;

import { colors, radii, screenMargin, spacing, theme, typography } from "@/theme";

import { contrastRatio } from "./support/contrast";

const round2 = (value: number) => Math.round(value * 100) / 100;

describe("contrast helper", () => {
  test("black on white is 21:1", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
  });

  test("the same color on itself is 1:1", () => {
    expect(contrastRatio("#6d5bf6", "#6d5bf6")).toBeCloseTo(1, 5);
  });

  test("is symmetric", () => {
    expect(contrastRatio("#d73402", "#ffffff")).toBeCloseTo(contrastRatio("#ffffff", "#d73402"), 10);
  });

  test("rejects colors that are not #rrggbb", () => {
    expect(() => contrastRatio("red", "#ffffff")).toThrow();
  });
});

describe("theme colors (RF-4)", () => {
  test("brand and text colors", () => {
    expect(colors.primary).toBe("#d73402");
    expect(colors.primaryPressed).toBe("#b82c03");
    expect(colors.primaryGradientEnd).toBe("#a82a05");
    expect(colors.accent).toBe("#6d5bf6");
    expect(colors.text).toBe("#ffffff");
    expect(colors.textSecondary).toBe("#8f8f94");
    expect(colors.link).toBe("#a99dff");
    expect(colors.black).toBe("#000000");
  });

  test("surfaces", () => {
    expect(colors.surface).toBe("#222222");
    expect(colors.overlay).toBe("#17171b");
    expect(colors.canvas).toBe("#121116");
    expect(colors.scrim).toBe("rgba(0, 0, 0, 0.7)");
  });

  test("background is a vertical gradient from #121116 (top) to #000000 (bottom)", () => {
    expect(colors.backgroundGradient).toEqual({ top: "#121116", bottom: "#000000" });
    expect(colors.backgroundGradient.top).toBe(colors.canvas);
  });

  test("fields are black with a #5a5a5a border (lighter than the Figma's #3b3b3b, for 3:1)", () => {
    expect(colors.fieldBorder).toBe("#5a5a5a");
    expect(contrastRatio(colors.fieldBorder, colors.black)).toBeGreaterThanOrEqual(3);
  });

  test("category palette keeps its order", () => {
    expect(colors.categories).toEqual(["#d73402", "#6d5bf6", "#c9c0ff", "#f2b84b"]);
  });

  test("every color is a #rrggbb hex string", () => {
    const all: string[] = [
      colors.primary,
      colors.primaryPressed,
      colors.primaryGradientEnd,
      colors.primaryShade,
      colors.accent,
      colors.text,
      colors.black,
      colors.textSecondary,
      colors.link,
      colors.surface,
      colors.overlay,
      colors.canvas,
      colors.backgroundGradient.top,
      colors.backgroundGradient.bottom,
      colors.fieldBorder,
      ...colors.categories,
    ];
    for (const color of all) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe("theme contrast (RF-6)", () => {
  test("spec 007: the dark bars and chips on the orange card carry white text (9.82:1)", () => {
    expect(colors.primaryShade).toBe("#7a2810");
    expect(contrastRatio(colors.text, colors.primaryShade)).toBeGreaterThanOrEqual(4.5);
    expect(round2(contrastRatio(colors.text, colors.primaryShade))).toBe(9.82);
  });

  test("white on primary is 4.79:1 and white on accent is 4.69:1 (values in MEMORY.md)", () => {
    expect(round2(contrastRatio(colors.text, colors.primary))).toBe(4.79);
    expect(round2(contrastRatio(colors.text, colors.accent))).toBe(4.69);
  });

  // Spec 005, cambio del 2026-11-19: the rows of the admin Home (RF-28), the Figma's #3b3b3b for Próximos.
  test("the rows of the admin Home: white on primary and on rowMuted, black on white, all >= 4.5:1", () => {
    expect(colors.rowMuted).toBe("#3b3b3b");
    expect(contrastRatio(colors.text, colors.primary)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colors.text, colors.rowMuted)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colors.black, colors.text)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colors.text, colors.overlay)).toBeGreaterThanOrEqual(4.5);
  });

  // Spec 012: the moving border of the "Resumen del día" card, on the dark inside of the card.
  test("spec 012: the AI border colors are violet (accent), blue and pink, each at least 3:1 on overlay", () => {
    expect(colors.aiGlow).toEqual([colors.accent, "#4c8dff", "#e879c9"]);
    for (const color of colors.aiGlow) expect(contrastRatio(color, colors.overlay)).toBeGreaterThanOrEqual(3);
  });

  test("Welcome outline button: white text and border on black", () => {
    expect(contrastRatio(colors.text, colors.black)).toBeGreaterThanOrEqual(4.5);
  });

  test.each([
    ["primary", colors.primary],
    ["primaryPressed", colors.primaryPressed],
    ["primaryGradientEnd", colors.primaryGradientEnd],
    ["accent", colors.accent],
  ])("white text on the %s fill is at least 4.5:1", (_name, fill) => {
    expect(contrastRatio(colors.text, fill)).toBeGreaterThanOrEqual(4.5);
  });

  const backgrounds: [string, string][] = [
    ["gradient top", colors.backgroundGradient.top],
    ["gradient bottom", colors.backgroundGradient.bottom],
    ["surface", colors.surface],
    ["overlay", colors.overlay],
  ];
  const texts: [string, string][] = [
    ["text", colors.text],
    ["textSecondary", colors.textSecondary],
    ["link", colors.link],
  ];

  describe.each(texts)("%s", (_textName, textColor) => {
    test.each(backgrounds)("on %s is at least 4.5:1", (_bgName, bg) => {
      expect(contrastRatio(textColor, bg)).toBeGreaterThanOrEqual(4.5);
    });
  });

  test.each(colors.categories.map((c, i) => [i + 1, c] as const))(
    "category color %i on surface is at least 3:1",
    (_index, color) => {
      expect(contrastRatio(color, colors.surface)).toBeGreaterThanOrEqual(3);
    },
  );

  test("the weakest category color on surface is 3.32:1 (value in MEMORY.md)", () => {
    const lowest = Math.min(...colors.categories.map((c) => contrastRatio(c, colors.surface)));
    expect(round2(lowest)).toBe(3.32);
  });
});

describe("theme spacing (RF-4, RF-5)", () => {
  test("the scale is 4, 8, 12, 16, 20, 24, 32, 40", () => {
    expect(Object.values(spacing)).toEqual([4, 8, 12, 16, 20, 24, 32, 40]);
  });

  test("the screen side margin is 20 and belongs to the scale", () => {
    expect(screenMargin).toBe(20);
    expect(Object.values(spacing)).toContain(screenMargin);
  });

  test("every spacing value is a multiple of 4", () => {
    for (const value of Object.values(spacing)) {
      expect(value % 4).toBe(0);
    }
  });
});

describe("theme radii (RF-4, RF-5)", () => {
  test("radii are 8, 12, 16 and 24 plus a full-rounding pill", () => {
    expect(radii).toEqual({ sm: 8, md: 12, lg: 16, xl: 24, pill: 1000 });
  });

  test("every radius is a multiple of 4", () => {
    for (const value of Object.values(radii)) {
      expect(value % 4).toBe(0);
    }
  });
});

describe("theme typography (RF-4, RF-5)", () => {
  test("text sizes are 12, 14, 16, 20, 24, 32", () => {
    expect(Object.values(typography.sizes)).toEqual([12, 14, 16, 20, 24, 32]);
  });

  test("no text size is below the 12 pt floor", () => {
    for (const size of Object.values(typography.sizes)) {
      expect(size).toBeGreaterThanOrEqual(12);
    }
  });

  test("weights are regular, semibold and bold", () => {
    expect(typography.weights).toEqual({ regular: "400", semibold: "600", bold: "700" });
  });

  test("uses the system font (no custom font family)", () => {
    expect(typography).not.toHaveProperty("fontFamily");
  });
});

describe("theme object (RF-4)", () => {
  test("groups every token set in a single import", () => {
    expect(Object.keys(theme).sort()).toEqual(
      ["barSurface", "colors", "radii", "screenMargin", "spacing", "typography"],
    );
    expect(theme.colors).toBe(colors);
    expect(theme.spacing).toBe(spacing);
    expect(theme.screenMargin).toBe(screenMargin);
    expect(theme.radii).toBe(radii);
    expect(theme.typography).toBe(typography);
  });

  test("the tab bar surface: the overlay with a surface border", () => {
    expect(theme.barSurface).toEqual({ backgroundColor: colors.overlay, borderWidth: 1, borderColor: colors.surface });
  });
});

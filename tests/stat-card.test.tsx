import { render, screen } from "@testing-library/react-native";
import { processColor } from "react-native";

import { StatCard } from "@/components/stat-card";
import { theme } from "@/theme";

// Spec 007 · T4: a total of the admin Home and Dashboard (RF-1 to RF-3, RF-6), as the cards of the Figma.
// It only informs: it is read as one text and is not a button.
describe("stat card", () => {
  test("RF-1: the title and the value, read as one text", async () => {
    await render(<StatCard title="Ingresos hoy" value="$100.300" tone="accent" />);
    expect(screen.getByText("Ingresos hoy")).toBeOnTheScreen();
    expect(screen.getByText("$100.300")).toBeOnTheScreen();
    expect(screen.getByLabelText("Ingresos hoy, $100.300")).toBeOnTheScreen();
  });

  test("it is not a button", async () => {
    await render(<StatCard title="Pedidos hoy" value="40" tone="surface" />);
    expect(screen.queryAllByRole("button")).toEqual([]);
  });

  test("while loading, a dash that is read as loading", async () => {
    await render(<StatCard title="Por entregar" value={null} tone="primary" />);
    expect(screen.getByText("—")).toBeOnTheScreen();
    expect(screen.getByLabelText("Por entregar, cargando")).toBeOnTheScreen();
  });

  test("a long amount stays on one line and shrinks to fit", async () => {
    await render(<StatCard title="Este mes" value="$12.345.678" tone="accent" />);
    const value = screen.getByText("$12.345.678");
    expect(value.props.numberOfLines).toBe(1);
    expect(value.props.adjustsFontSizeToFit).toBe(true);
  });

  test("T9 (emil-design-eng): the value uses figures of one width, so it does not jump when Realtime changes it", async () => {
    await render(<StatCard title="Ingresos hoy" value="$100.300" tone="accent" />);
    expect(screen.getByText("$100.300")).toHaveStyle({ fontVariant: ["tabular-nums"] });
  });

  test.each([
    ["accent", theme.colors.accent, theme.colors.text],
    ["surface", theme.colors.surface, theme.colors.text],
    ["light", theme.colors.text, theme.colors.black],
  ] as const)("the %s tone: its background and its text", async (tone, background, text) => {
    await render(<StatCard title="Esta semana" value="$128.450" tone={tone} />);
    expect(screen.getByLabelText("Esta semana, $128.450")).toHaveStyle({ backgroundColor: background });
    expect(screen.getByText("$128.450")).toHaveStyle({ color: text });
  });

  test("the primary tone is the orange gradient, with white text", async () => {
    await render(<StatCard title="Por entregar" value="5" tone="primary" />);
    // The native gradient receives the colors already processed.
    expect(screen.getByLabelText("Por entregar, 5").props.colors).toEqual([
      processColor(theme.colors.primary),
      processColor(theme.colors.primaryGradientEnd),
    ]);
    expect(screen.getByText("5")).toHaveStyle({ color: theme.colors.text });
  });
});

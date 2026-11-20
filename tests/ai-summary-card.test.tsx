import { fireEvent, render, screen } from "@testing-library/react-native";

import { AiSummaryCard } from "@/components/ai-summary-card";
import type { DailySummaryCard } from "@/lib/daily-summary";

// Spec 012 · T4: the "Resumen del día" card of the Dashboard (RF-1 to RF-5, RF-14, RF-18, RF-20 to RF-22).
// A dark card with a light border in a violet, blue and pink gradient that moves slowly (a Reanimated
// CSS animation), still with "Reduce motion". The text always sits on the dark inside.
const mockReduced = { current: false };
jest.mock("react-native-reanimated", () => {
  const { View } = jest.requireActual<typeof import("react-native")>("react-native");
  return { __esModule: true, default: { View }, useReducedMotion: () => mockReduced.current };
});

const TEXT = "Se entregaron 6 pedidos por $63.000 y quedaron 3 por entregar. Lo más vendido fueron los Grandes.";
type SummaryWithText = Extract<DailySummaryCard, { text: string }>;
const today = (fields: Partial<SummaryWithText> = {}): SummaryWithText => ({
  kind: "today",
  text: TEXT,
  updating: false,
  updateFailed: false,
  ...fields,
});

beforeEach(() => {
  mockReduced.current = false;
});

describe("AiSummaryCard", () => {
  test("RF-1, RF-2: Resumen del día with its text and Hecho con IA, read as one block", async () => {
    await render(<AiSummaryCard card={today()} onRetry={() => {}} />);
    expect(screen.getByText("Resumen del día")).toBeOnTheScreen();
    expect(screen.getByText(TEXT)).toBeOnTheScreen();
    expect(screen.getByText("Hecho con IA")).toBeOnTheScreen();
    expect(screen.getByTestId("ai-summary-text")).toHaveProp("accessible", true);
    expect(screen.getByTestId("ai-summary-text").props.accessibilityLabel).toBe(`Resumen del día. ${TEXT} Hecho con IA`);
    expect(screen.queryByRole("button", { name: "Reintentar" })).toBeNull();
  });

  test("RF-14: before 21 h, yesterday's summary is titled Resumen de ayer", async () => {
    await render(<AiSummaryCard card={today({ kind: "yesterday" })} onRetry={() => {}} />);
    expect(screen.getByText("Resumen de ayer")).toBeOnTheScreen();
    expect(screen.getByText(TEXT)).toBeOnTheScreen();
  });

  test("RF-14: without yesterday's, the notice that it is made at 21 h", async () => {
    await render(<AiSummaryCard card={{ kind: "waiting" }} onRetry={() => {}} />);
    expect(screen.getByText("El resumen de hoy se arma a las 21 h")).toBeOnTheScreen();
    expect(screen.queryByText("Hecho con IA")).toBeNull();
  });

  test("RF-18: while the first one of the day is made, Armando el resumen…", async () => {
    await render(<AiSummaryCard card={{ kind: "loading" }} onRetry={() => {}} />);
    expect(screen.getByText("Armando el resumen…")).toBeOnTheScreen();
  });

  test("RF-20, RF-22: when it could not be made, the notice and Reintentar, at least 48 pt", async () => {
    const onRetry = jest.fn();
    await render(<AiSummaryCard card={{ kind: "error" }} onRetry={onRetry} />);
    expect(screen.getByText("No pudimos armar el resumen")).toBeOnTheScreen();
    const retry = screen.getByRole("button", { name: "Reintentar" });
    const { minHeight } = Object.assign({}, ...[retry.props.style].flat(Infinity).filter(Boolean));
    expect(minHeight).toBeGreaterThanOrEqual(48);
    await fireEvent.press(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  test("RF-19, RF-21: making it again keeps the text; when it fails, the notice and Reintentar under it", async () => {
    const onRetry = jest.fn();
    const view = await render(<AiSummaryCard card={today({ updating: true })} onRetry={onRetry} />);
    expect(screen.getByText(TEXT)).toBeOnTheScreen();
    expect(screen.queryByText("No pudimos actualizar el resumen")).toBeNull();
    await view.rerender(<AiSummaryCard card={today({ updateFailed: true })} onRetry={onRetry} />);
    expect(screen.getByText(TEXT)).toBeOnTheScreen();
    expect(screen.getByText("No pudimos actualizar el resumen")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Reintentar" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  test("RF-1: the sparks icon in its square, hidden from screen readers", async () => {
    await render(<AiSummaryCard card={today()} onRetry={() => {}} />);
    expect(screen.getByTestId("icon:sparks", { includeHiddenElements: true })).toBeOnTheScreen();
  });

  test("RF-5: the border light moves slowly and endlessly, only with transform", async () => {
    await render(<AiSummaryCard card={today()} onRetry={() => {}} />);
    const glow = screen.getByTestId("ai-summary-glow", { includeHiddenElements: true });
    const style = Object.assign({}, ...[glow.props.style].flat(Infinity).filter(Boolean));
    expect(style.animationDuration).toBe("8000ms");
    expect(style.animationIterationCount).toBe("infinite");
    expect(style.animationTimingFunction).toBe("linear");
    expect(Object.keys(style.animationName)).toEqual(["from", "to"]);
    expect(style.animationName.to).toEqual({ transform: [{ translateX: "-50%" }] });
  });

  test("the border light pauses while the Dashboard is not on screen (impeccable audit)", async () => {
    const view = await render(<AiSummaryCard card={today()} onRetry={() => {}} />);
    const styleOf = () =>
      Object.assign({}, ...[screen.getByTestId("ai-summary-glow", { includeHiddenElements: true }).props.style].flat(Infinity).filter(Boolean));
    expect(styleOf().animationPlayState).toBe("running");
    await view.rerender(<AiSummaryCard card={today()} onRetry={() => {}} paused />);
    expect(styleOf().animationPlayState).toBe("paused");
  });

  test("RF-5: with Reduce motion, the border light stays still", async () => {
    mockReduced.current = true;
    await render(<AiSummaryCard card={today()} onRetry={() => {}} />);
    const glow = screen.getByTestId("ai-summary-glow", { includeHiddenElements: true });
    const style = Object.assign({}, ...[glow.props.style].flat(Infinity).filter(Boolean));
    expect(style.animationName).toBeUndefined();
  });
});

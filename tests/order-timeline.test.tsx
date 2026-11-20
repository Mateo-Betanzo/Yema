import { render, screen, within } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import { TimelineBar, TimelineSteps } from "@/components/order-timeline";
import type { ClientOrderBase } from "@/logic/client-orders";

// Reanimated needs its native UI runtime, which Jest does not have: Animated.View is a plain View with
// its style props, so the tests read the CSS animation of the light.
const mockReduced = { current: false };
jest.mock("react-native-reanimated", () => {
  const { View } = jest.requireActual<typeof import("react-native")>("react-native");
  return {
    __esModule: true,
    default: { View },
    cubicBezier: (...points: number[]) => `cubic-bezier(${points.join(", ")})`,
    useReducedMotion: () => mockReduced.current,
  };
});

beforeEach(() => {
  mockReduced.current = false;
});

// Spec 006 · T6: the timeline of the card (RF-3) and of the order detail (RF-23).
const order = (fields: Partial<ClientOrderBase>): ClientOrderBase => ({
  id: 187,
  status: "pending",
  status_reason: null,
  cancelled_by: null,
  created_at: "2026-11-13T13:32:00Z",
  accepted_at: null,
  on_the_way_at: null,
  delivered_at: null,
  rejected_at: null,
  cancelled_at: null,
  items: [],
  ...fields,
});

describe("TimelineBar", () => {
  test("RF-3: four segments, the reached ones in white, with its text for screen readers", async () => {
    await render(<TimelineBar status="on_the_way" />);
    expect(screen.getByLabelText("Paso 3 de 4: En camino")).toBeOnTheScreen();
    const segments = screen.getAllByTestId(/^timeline-segment-/, { includeHiddenElements: true });
    expect(segments).toHaveLength(4);
    expect(segments.slice(0, 3).every((segment) => segment.props.style.backgroundColor === "#ffffff")).toBe(true);
    expect(segments[3].props.style.backgroundColor).not.toBe("#ffffff");
  });

  test("RF-3: a delivered order reaches the four steps", async () => {
    await render(<TimelineBar status="delivered" />);
    expect(screen.getByLabelText("Paso 4 de 4: Entregado")).toBeOnTheScreen();
  });

  // /feature 2026-11-18: a light crosses the next step, left to right, every little while.
  test.each([
    ["pending", 2],
    ["accepted", 3],
    ["on_the_way", 4],
  ] as const)("%s: a light sweeps segment %i, the next step, again and again", async (status, next) => {
    await render(<TimelineBar status={status} />);
    const lights = screen.getAllByTestId("timeline-shimmer", { includeHiddenElements: true });
    expect(lights).toHaveLength(1);
    const segment = screen.getByTestId(`timeline-segment-${next}`, { includeHiddenElements: true });
    expect(within(segment).getByTestId("timeline-shimmer", { includeHiddenElements: true })).toBeTruthy();
    expect(segment).toHaveStyle({ overflow: "hidden" });
    expect(StyleSheet.flatten(lights[0].props.style)).toMatchObject({
      animationName: expect.anything(),
      animationIterationCount: "infinite",
    });
  });

  // /feature 2026-11-18: the next step is lighter than the missing ones after it, also with reduce motion.
  test.each([
    ["pending", 2, false],
    ["accepted", 3, false],
    ["on_the_way", 4, true],
  ] as const)("%s: segment %i, the next step, is lighter than the ones after it", async (status, next, reduced) => {
    mockReduced.current = reduced;
    await render(<TimelineBar status={status} />);
    const segments = screen.getAllByTestId(/^timeline-segment-/, { includeHiddenElements: true });
    expect(segments[next - 1].props.style.backgroundColor).toBe("rgba(255, 255, 255, 0.35)");
    for (const segment of segments.slice(next)) {
      expect(segment.props.style.backgroundColor).toBe("rgba(0, 0, 0, 0.3)");
    }
  });

  test("a delivered order has no next step: no light", async () => {
    await render(<TimelineBar status="delivered" />);
    expect(screen.queryAllByTestId("timeline-shimmer", { includeHiddenElements: true })).toHaveLength(0);
  });

  test("with reduce motion on, the bar stays still", async () => {
    mockReduced.current = true;
    await render(<TimelineBar status="accepted" />);
    expect(screen.queryAllByTestId("timeline-shimmer", { includeHiddenElements: true })).toHaveLength(0);
  });

  test("RF-10: a rejected or cancelled order has no bar", async () => {
    await render(<TimelineBar status="rejected" />);
    expect(screen.queryAllByTestId(/^timeline-segment-/, { includeHiddenElements: true })).toHaveLength(0);
  });
});

describe("TimelineSteps", () => {
  test("RF-23: each step reached with its date and time; the missing ones without", async () => {
    await render(<TimelineSteps order={order({ status: "accepted", accepted_at: "2026-11-13T13:40:00Z" })} />);
    expect(screen.getByLabelText("Recibido, vie 13 nov 10:32")).toBeOnTheScreen();
    expect(screen.getByLabelText("Aceptado, vie 13 nov 10:40")).toBeOnTheScreen();
    expect(screen.getByLabelText("En camino, pendiente")).toBeOnTheScreen();
    expect(screen.getByLabelText("Entregado, pendiente")).toBeOnTheScreen();
    expect(screen.getByText("vie 13 nov 10:40")).toBeOnTheScreen();
  });

  test("RF-23: a rejected order ends in Rechazado instead of the missing steps", async () => {
    await render(<TimelineSteps order={order({ status: "rejected", rejected_at: "2026-11-13T13:50:00Z" })} />);
    expect(screen.getByLabelText("Recibido, vie 13 nov 10:32")).toBeOnTheScreen();
    expect(screen.getByLabelText("Rechazado, vie 13 nov 10:50")).toBeOnTheScreen();
    expect(screen.queryByText("Aceptado")).toBeNull();
    expect(screen.queryByText("Entregado")).toBeNull();
  });
});

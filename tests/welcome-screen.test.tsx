import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import Welcome from "@/app/(auth)/welcome";

// Spec 002 · T7 (RF-1, RF-2) and the Welcome of the Figma of 2026-11-07: black background, the orange
// crescent that glows, and the two actions.
const mockPush = jest.fn();
let mockReducedMotion = false;

jest.mock("expo-router", () => ({ router: { push: (href: string) => mockPush(href) } }));
// Reanimated needs its native UI runtime, which Jest does not have (its own mock still loads it).
// The crescent only uses these three: Animated.View renders as a plain View with its style props.
jest.mock("react-native-reanimated", () => {
  const { View } = jest.requireActual<typeof import("react-native")>("react-native");
  return {
    __esModule: true,
    default: { View },
    cubicBezier: (...points: number[]) => `cubic-bezier(${points.join(", ")})`,
    useReducedMotion: () => mockReducedMotion,
  };
});

beforeEach(() => {
  mockPush.mockClear();
  mockReducedMotion = false;
});

describe("welcome screen", () => {
  test("RF-1: shows the title, the subtitle and both actions", async () => {
    await render(<Welcome />);
    expect(screen.getByRole("header", { name: "Bienvenido" })).toBeOnTheScreen();
    expect(screen.getByText("Iniciá sesión o creá tu cuenta")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Iniciar sesión" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Crear cuenta" })).toBeOnTheScreen();
    // RF-44 (change of 2026-11-19): Google is offered only in Login.
    expect(screen.queryByRole("button", { name: "Continuar con Google" })).toBeNull();
  });

  test.each([
    ["Iniciar sesión", "/login"],
    ["Crear cuenta", "/sign-up"],
  ])("RF-2: %s opens %s", async (name, href) => {
    await render(<Welcome />);
    await fireEvent.press(screen.getByRole("button", { name }));
    expect(mockPush).toHaveBeenCalledWith(href);
  });

  test("the crescent is decorative: screen readers skip it", async () => {
    await render(<Welcome />);
    const eclipse = screen.getByTestId("welcome-eclipse", { includeHiddenElements: true });
    expect(eclipse).toHaveProp("accessibilityElementsHidden", true);
    expect(eclipse).toHaveProp("importantForAccessibility", "no-hide-descendants");
  });

  test("the crescent glows: the glow breathes and the highlight slides along the rim", async () => {
    await render(<Welcome />);
    const glow = screen.getByTestId("welcome-eclipse-glow", { includeHiddenElements: true });
    const highlight = screen.getByTestId("welcome-eclipse-highlight", { includeHiddenElements: true });
    for (const layer of [glow, highlight]) {
      expect(StyleSheet.flatten(layer.props.style)).toMatchObject({
        animationName: expect.anything(),
        animationIterationCount: "infinite",
        animationDirection: "alternate",
      });
    }
  });

  test("with reduce motion on, the crescent stays still", async () => {
    mockReducedMotion = true;
    await render(<Welcome />);
    const glow = screen.getByTestId("welcome-eclipse-glow", { includeHiddenElements: true });
    const highlight = screen.getByTestId("welcome-eclipse-highlight", { includeHiddenElements: true });
    for (const layer of [glow, highlight]) {
      expect(StyleSheet.flatten(layer.props.style)).not.toHaveProperty("animationName");
    }
  });
});

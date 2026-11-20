import { render, screen } from "@testing-library/react-native";
import type { ReactNode } from "react";

import AdminLayout from "@/app/admin/_layout";

// Spec 011 · T8: how the admin Stack presents the menu of the Perfil (RF-2, RF-4), as the client's (spec
// 010). The navigator is replaced: each screen shows the options it gets. The native sheet itself is
// checked in Expo Go.
const mockReduced = { current: false };
jest.mock("react-native-reanimated", () => ({ useReducedMotion: () => mockReduced.current }));
jest.mock("expo-router", () => {
  const { Text: MockText } = jest.requireActual("react-native");
  function Stack({ children }: { children: ReactNode }) {
    return <>{children}</>;
  }
  Stack.Screen = function Screen({ name, options }: { name: string; options?: Record<string, unknown> }) {
    return <MockText testID={`screen-${name}`}>{JSON.stringify(options ?? {})}</MockText>;
  };
  return { Stack };
});

const optionsOf = (name: string) => JSON.parse(screen.getByTestId(`screen-${name}`).props.children);

beforeEach(() => {
  mockReduced.current = false;
});

describe("admin layout", () => {
  test("RF-2: the menu is a form sheet as tall as its content, with a grabber, and slides as usual", async () => {
    await render(<AdminLayout />);
    expect(optionsOf("menu")).toMatchObject({
      presentation: "formSheet",
      sheetAllowedDetents: "fitToContents",
      sheetGrabberVisible: true,
      animation: "default",
    });
  });

  test("RF-4: with Reduce motion, the menu opens and closes without sliding", async () => {
    mockReduced.current = true;
    await render(<AdminLayout />);
    expect(optionsOf("menu")).toMatchObject({ presentation: "formSheet", animation: "none" });
  });

  test("the order detail still slides up as a modal (spec 005)", async () => {
    await render(<AdminLayout />);
    expect(optionsOf("order/[id]")).toMatchObject({ presentation: "modal" });
  });
});

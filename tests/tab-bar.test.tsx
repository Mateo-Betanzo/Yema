import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ComponentProps } from "react";

import { TabBar } from "@/components/tab-bar";
import { theme } from "@/theme";

// Spec 002 · T9: the pill tab bar (RF-27). It receives what expo-router's Tabs gives a custom bar.
type Props = ComponentProps<typeof TabBar>;

const routes = [
  { key: "index-1", name: "index" },
  { key: "cart-1", name: "cart" },
  { key: "profile-1", name: "profile" },
];
const titles: Record<string, string> = { index: "Home", cart: "Carrito", profile: "Perfil" };

const emit = jest.fn((_event: { type: string; target: string; canPreventDefault: boolean }) => ({
  defaultPrevented: false,
}));
const navigateToTab = jest.fn();

function props(index: number, list = routes): Props {
  return {
    state: { index, routes: list },
    descriptors: Object.fromEntries(list.map((r) => [r.key, { options: { title: titles[r.name] } }])),
    emitter: { emit },
    navigateToTab,
    insets: { top: 0, bottom: 34, left: 0, right: 0 },
    icons: { index: "home-simple", cart: "cart", profile: "user" },
  } as unknown as Props;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("tab bar (RF-27)", () => {
  test("each tab is only an icon with its name as accessible label", async () => {
    await render(<TabBar {...props(0)} />);
    expect(screen.getAllByRole("tab")).toHaveLength(3);
    for (const name of ["Home", "Carrito", "Perfil"]) {
      expect(screen.getByRole("tab", { name })).toBeOnTheScreen();
      expect(screen.queryByText(name)).toBeNull();
    }
  });

  test("marks the active tab as selected", async () => {
    await render(<TabBar {...props(1)} />);
    expect(screen.getByRole("tab", { name: "Carrito" })).toBeSelected();
    expect(screen.getByRole("tab", { name: "Home" })).not.toBeSelected();
    expect(screen.getByRole("tab", { name: "Perfil" })).not.toBeSelected();
  });

  test("each tab is at least 48 × 48 pt", async () => {
    await render(<TabBar {...props(0)} />);
    for (const tab of screen.getAllByRole("tab")) {
      expect(tab).toHaveStyle({ width: 56, height: 56 });
    }
  });

  test("pressing another tab announces the press and opens it", async () => {
    await render(<TabBar {...props(0)} />);
    await fireEvent.press(screen.getByRole("tab", { name: "Perfil" }));
    expect(emit).toHaveBeenCalledWith({ type: "tabPress", target: "profile-1", canPreventDefault: true });
    expect(navigateToTab).toHaveBeenCalledWith("profile-1");
  });

  test("pressing the active tab does not navigate", async () => {
    await render(<TabBar {...props(0)} />);
    await fireEvent.press(screen.getByRole("tab", { name: "Home" }));
    expect(emit).toHaveBeenCalledTimes(1);
    expect(navigateToTab).not.toHaveBeenCalled();
  });

  test("a screen that prevents the press keeps the current tab", async () => {
    emit.mockReturnValueOnce({ defaultPrevented: true });
    await render(<TabBar {...props(0)} />);
    await fireEvent.press(screen.getByRole("tab", { name: "Carrito" }));
    expect(navigateToTab).not.toHaveBeenCalled();
  });

  test("each tab shows its icon, in white", async () => {
    await render(<TabBar {...props(0)} />);
    for (const name of ["home-simple", "cart", "user"]) {
      expect(screen.getByTestId(`icon:${name}`, { includeHiddenElements: true })).toHaveProp("tintColor", theme.colors.text);
    }
  });
});

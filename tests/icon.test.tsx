import { render, screen } from "@testing-library/react-native";

import { ICONS, Icon } from "@/components/icon";
import { theme } from "@/theme";

// The icons of assets/svg (Iconoir, 24 × 24): drawn by expo-image and painted whole with tintColor,
// so the color of the file does not matter. Decorative: the button around them carries the label.
describe("Icon", () => {
  test("draws the file of its name, at its size and in the given color", async () => {
    await render(<Icon name="cart" size={24} color={theme.colors.text} />);
    const icon = screen.getByTestId("icon:cart", { includeHiddenElements: true });
    expect(icon).toHaveProp("source", ICONS.cart);
    expect(icon).toHaveProp("tintColor", theme.colors.text);
    expect(icon).toHaveStyle({ width: 24, height: 24 });
  });

  test("the G of Google keeps its four colors: it is never tinted (/feature 2026-11-19)", async () => {
    await render(<Icon name="google" size={24} color={theme.colors.text} />);
    const icon = screen.getByTestId("icon:google", { includeHiddenElements: true });
    expect(icon).toHaveProp("source", ICONS.google);
    expect(icon.props.tintColor).toBeUndefined();
  });

  test("is hidden from screen readers", async () => {
    await render(<Icon name="plus" size={24} color={theme.colors.text} />);
    expect(screen.getByTestId("icon:plus", { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.queryByTestId("icon:plus")).toBeNull();
  });

  test("every name points to an SVG of assets/svg", () => {
    for (const source of Object.values(ICONS)) expect(source).toBeTruthy();
    expect(Object.keys(ICONS).sort()).toEqual(
      [
        "calendar",
        "cart",
        "clock",
        "edit-pencil",
        "eye",
        "eye-closed",
        "google",
        "home-simple",
        "list",
        "log-out",
        "menu",
        "minus",
        "more-vert",
        "package",
        "plus",
        "sparks",
        "user",
        "view-grid",
      ],
    );
  });
});

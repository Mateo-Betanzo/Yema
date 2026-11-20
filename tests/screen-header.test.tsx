import { fireEvent, render, screen } from "@testing-library/react-native";

import { ScreenHeader } from "@/components/screen-header";

// Spec 003 · T6: the header of the admin screens, as in the Figma (back circle, title, action circle).
const mockBack = jest.fn();
jest.mock("expo-router", () => ({ router: { back: () => mockBack() } }));

beforeEach(() => mockBack.mockClear());

describe("screen header", () => {
  test("shows the title as a header and a back button that goes back", async () => {
    await render(<ScreenHeader title="Nuevo producto" />);
    expect(screen.getByRole("header", { name: "Nuevo producto" })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Volver" }));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  test("a tab root has no back button", async () => {
    await render(<ScreenHeader title="Productos" back={false} />);
    expect(screen.queryByRole("button", { name: "Volver" })).toBeNull();
  });

  test("an optional action, with its accessible name", async () => {
    const onPress = jest.fn();
    await render(<ScreenHeader title="Productos" back={false} action={{ icon: "plus", label: "Nuevo producto", onPress }} />);
    await fireEvent.press(screen.getByRole("button", { name: "Nuevo producto" }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  // Spec 010 · T3 (RF-7, RF-8): the cart of the Home shows its units over the action.
  test("spec 010, RF-8: a badge with the number over the action, hidden from screen readers", async () => {
    await render(
      <ScreenHeader title="Hola" back={false} action={{ icon: "cart", label: "Carrito, 3 productos", onPress: () => {} }} />,
    );
    expect(screen.queryByTestId("header-badge", { includeHiddenElements: true })).toBeNull();

    await render(
      <ScreenHeader
        title="Hola"
        back={false}
        action={{ icon: "cart", label: "Carrito, 3 productos", onPress: () => {}, badge: 3 }}
      />,
    );
    const badge = screen.getByTestId("header-badge", { includeHiddenElements: true });
    expect(badge).toHaveTextContent("3");
    // Spec 010 · T9 (audit): a ring of the background separates the orange from the button, and the
    // badge grows with the system text size instead of clipping it.
    expect(badge).toHaveStyle({ borderWidth: 2, borderColor: "#121116", minHeight: 22, minWidth: 22 });
    expect(screen.queryByTestId("header-badge")).toBeNull();
    expect(screen.getByRole("button", { name: "Carrito, 3 productos" })).toBeOnTheScreen();
  });

  test("spec 010, RF-8: a badge of 0 is not shown", async () => {
    await render(
      <ScreenHeader title="Hola" back={false} action={{ icon: "cart", label: "Carrito vacío", onPress: () => {}, badge: 0 }} />,
    );
    expect(screen.queryByTestId("header-badge", { includeHiddenElements: true })).toBeNull();
  });

  test("the buttons are 48 pt", async () => {
    await render(<ScreenHeader title="Stock" action={{ icon: "plus", label: "Agregar", onPress: () => {} }} />);
    for (const button of screen.getAllByRole("button")) expect(button).toHaveStyle({ width: 48, height: 48 });
  });

  test("the back button and the action look like the tab bar", async () => {
    await render(<ScreenHeader title="Stock" action={{ icon: "plus", label: "Agregar", onPress: () => {} }} />);
    for (const name of ["Volver", "Agregar"]) {
      expect(screen.getByRole("button", { name })).toHaveStyle({
        backgroundColor: "#17171b",
        borderWidth: 1,
        borderColor: "#222222",
      });
    }
  });

  // Spec 003 · T12: the product screen has its name in the sheet, not in the header.
  test("without a title, only the buttons, with no empty header for screen readers", async () => {
    await render(<ScreenHeader action={{ icon: "cart", label: "Carrito vacío", onPress: () => {} }} />);
    expect(screen.queryByRole("header")).toBeNull();
    expect(screen.getByRole("button", { name: "Volver" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Carrito vacío" })).toBeOnTheScreen();
  });
});

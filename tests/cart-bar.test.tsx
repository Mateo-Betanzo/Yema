import { fireEvent, render, screen } from "@testing-library/react-native";

import { CartBar } from "@/components/cart-bar";

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }) }));

// The cart bar (spec 004, RF-13), and what spec 008 adds for the counter sale: its own action, disabled
// while the sale is empty, busy while it is sent, and at the bottom of a screen without the tab bar.
describe("cart bar", () => {
  test("spec 004: Ver carrito, with the units and the total", async () => {
    const onPress = jest.fn();
    await render(<CartBar total={10500} units={3} onPress={onPress} />);
    await fireEvent.press(screen.getByRole("button", { name: "Ver carrito, 3 productos, $10.500" }));
    expect(onPress).toHaveBeenCalled();
  });

  test("spec 008, RF-7: another action, named with the units and the total", async () => {
    await render(<CartBar total={10500} units={3} label="Confirmar venta" onPress={() => {}} />);
    expect(screen.getByRole("button", { name: "Confirmar venta, 3 productos, $10.500" })).toBeEnabled();
    expect(screen.getByText("Confirmar venta")).toBeOnTheScreen();
  });

  test("spec 008, RF-7: disabled, it takes no taps", async () => {
    const onPress = jest.fn();
    await render(<CartBar total={0} units={0} label="Confirmar venta" disabled onPress={onPress} />);
    const bar = screen.getByRole("button", { name: "Confirmar venta, 0 productos, $0" });
    expect(bar).toBeDisabled();
    await fireEvent.press(bar);
    expect(onPress).not.toHaveBeenCalled();
  });

  test("spec 008, RF-12: while busy, it shows it and takes no taps", async () => {
    const onPress = jest.fn();
    await render(<CartBar total={10500} units={3} label="Confirmar venta" busy onPress={onPress} />);
    expect(screen.getByLabelText("Enviando")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: /^Confirmar venta/ }));
    expect(onPress).not.toHaveBeenCalled();
  });

  test("spec 008: without a tab bar, it sits just above the safe area", async () => {
    await render(<CartBar total={10500} units={3} label="Confirmar venta" overTabBar={false} onPress={() => {}} />);
    expect(screen.getByTestId("cart-bar")).toHaveStyle({ bottom: 34 + 8 });
  });
});

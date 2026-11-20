import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Alert } from "react-native";

import ProductScreen from "@/app/client/product/[id]";
import { CartProvider } from "@/lib/cart";
import type { Cart } from "@/logic/cart";

// Spec 003 · T12 (cambio del 2026-11-18): the product screen (RF-29, RF-36 to RF-43), opened from the
// Shop. The product comes from the last Shop update (the hook is replaced); the cart is the real one,
// started with `initialItems`.
const PRODUCTS = [
  { id: 1, name: "Pack Mediano", description: "6 maples de medianos", price: 10500, format_id: 2, format_name: "Pack", format_eggs: 180, units_available: 20, available: true },
  { id: 2, name: "Maple Grande", description: null, price: 4000, format_id: 1, format_name: "Maple", format_eggs: 30, units_available: 0, available: false },
  { id: 3, name: "Maple Mediano", description: null, price: 3500, format_id: 1, format_name: "Maple", format_eggs: 30, units_available: 3, available: true },
];

type Shop = { data: unknown[] | undefined; isPending: boolean; isError: boolean; refetch: jest.Mock };
const mockShop: { current: Shop } = { current: { data: PRODUCTS, isPending: false, isError: false, refetch: jest.fn() } };
const mockActiveOrder = { current: { data: null as { id: number; status: string } | null, refetch: jest.fn() } };
const mockFocusRefreshes: unknown[] = [];
const mockParams = { current: { id: "1" } };
const mockRouter = { push: jest.fn(), back: jest.fn(), dismissTo: jest.fn() };
jest.mock("@/lib/catalog", () => ({ useShopProducts: () => mockShop.current }));
jest.mock("@/lib/orders", () => ({ useActiveOrder: () => mockActiveOrder.current }));
jest.mock("@/lib/use-refresh-on-focus", () => ({
  useRefreshOnFocus: (refetch: unknown) => mockFocusRefreshes.push(refetch),
}));
// Each focus callback the screen registers, to simulate coming back to it.
const mockFocusEffects: (() => void)[] = [];
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams.current,
  useFocusEffect: (effect: () => void) => mockFocusEffects.push(effect),
  router: {
    push: (...args: unknown[]) => mockRouter.push(...args),
    back: () => mockRouter.back(),
    dismissTo: (...args: unknown[]) => mockRouter.dismissTo(...args),
  },
}));

const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});

beforeEach(() => {
  mockShop.current = { data: PRODUCTS, isPending: false, isError: false, refetch: jest.fn() };
  mockActiveOrder.current = { data: null, refetch: jest.fn() };
  mockFocusRefreshes.length = 0;
  mockFocusEffects.length = 0;
  mockParams.current = { id: "1" };
  mockRouter.push.mockClear();
  mockRouter.back.mockClear();
  mockRouter.dismissTo.mockClear();
  alert.mockClear();
});

const tree = (items: Cart = []) => (
  <CartProvider initialItems={items}>
    <ProductScreen />
  </CartProvider>
);
const renderProduct = (id: number, items: Cart = []) => {
  mockParams.current = { id: String(id) };
  return render(tree(items));
};
const button = (name: string) => screen.getByRole("button", { name });
const minus = () => button("Quitar una unidad");
const plus = () => button("Sumar una unidad");
const quantity = () => screen.getByLabelText(/^Cantidad: /);
const cartButton = () => screen.getByRole("button", { name: /^Carrito/ });

describe("product screen", () => {
  test("RF-36: the egg, the name, the description, the price and the units left", async () => {
    await renderProduct(1);
    expect(screen.getByTestId("egg-image", { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByRole("header", { name: "Pack Mediano" })).toBeOnTheScreen();
    expect(screen.getByText("6 maples de medianos")).toBeOnTheScreen();
    expect(screen.getByText("$10.500")).toBeOnTheScreen();
    expect(screen.getByText("Quedan 20")).toBeOnTheScreen();
  });

  test("RF-36: without description, nothing in its place", async () => {
    await renderProduct(3);
    expect(screen.getByRole("header", { name: "Maple Mediano" })).toBeOnTheScreen();
    expect(screen.getByText("Quedan 3")).toBeOnTheScreen();
  });

  // The cart is a tab under this screen: dismissTo closes the screens above the tabs, as the confirmation.
  test("RF-29: back goes back to the Shop; the cart button shows its units and opens the cart", async () => {
    await renderProduct(1, [{ productId: 3, name: "Maple Mediano", quantity: 2 }]);
    await fireEvent.press(button("Volver"));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    expect(cartButton()).toHaveProp("accessibilityLabel", "Carrito, 2 productos");
    await fireEvent.press(cartButton());
    expect(mockRouter.dismissTo).toHaveBeenCalledWith("/client/cart");
  });

  test("RF-37: the selector starts at 1, − is disabled at 1 and + stops at the units left", async () => {
    await renderProduct(3);
    expect(quantity()).toHaveProp("accessibilityLabel", "Cantidad: 1");
    expect(minus()).toBeDisabled();
    await fireEvent.press(plus());
    await fireEvent.press(plus());
    expect(quantity()).toHaveProp("accessibilityLabel", "Cantidad: 3");
    expect(plus()).toBeDisabled();
    await fireEvent.press(minus());
    expect(quantity()).toHaveProp("accessibilityLabel", "Cantidad: 2");
  });

  test("RF-37: + stops at 5 when more units are left", async () => {
    await renderProduct(1);
    for (let tap = 0; tap < 6; tap++) await fireEvent.press(plus());
    expect(quantity()).toHaveProp("accessibilityLabel", "Cantidad: 5");
    expect(plus()).toBeDisabled();
  });

  test("RF-37, RF-38: with 3 in the cart it says so and + stops at 2", async () => {
    await renderProduct(1, [{ productId: 1, name: "Pack Mediano", quantity: 3 }]);
    expect(screen.getByText("Ya tenés 3 en el carrito")).toBeOnTheScreen();
    await fireEvent.press(plus());
    await fireEvent.press(plus());
    expect(quantity()).toHaveProp("accessibilityLabel", "Cantidad: 2");
    expect(plus()).toBeDisabled();
  });

  test("RF-38: without units in the cart, no line about it", async () => {
    await renderProduct(1);
    expect(screen.queryByText(/^Ya tenés \d/)).toBeNull();
  });

  test("RF-39: Agregar al carrito adds the chosen quantity and goes back to the Shop", async () => {
    await renderProduct(1, [{ productId: 1, name: "Pack Mediano", quantity: 1 }]);
    await fireEvent.press(plus());
    await fireEvent.press(button("Agregar al carrito"));
    expect(cartButton()).toHaveProp("accessibilityLabel", "Carrito, 3 productos");
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  test("RF-40: Comprar adds the chosen quantity and opens the checkout", async () => {
    await renderProduct(3, [{ productId: 1, name: "Pack Mediano", quantity: 1 }]);
    await fireEvent.press(plus());
    await fireEvent.press(button("Comprar"));
    expect(cartButton()).toHaveProp("accessibilityLabel", "Carrito, 3 productos");
    expect(mockRouter.push).toHaveBeenCalledWith("/client/checkout");
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  test("RF-40: after adding, the selector starts again at 1 (back from the checkout)", async () => {
    await renderProduct(1);
    await fireEvent.press(plus());
    await fireEvent.press(button("Comprar"));
    expect(quantity()).toHaveProp("accessibilityLabel", "Cantidad: 1");
    expect(screen.getByText("Ya tenés 2 en el carrito")).toBeOnTheScreen();
  });

  const expectAllDisabled = () => {
    for (const control of [minus(), plus(), button("Agregar al carrito"), button("Comprar")]) {
      expect(control).toBeDisabled();
    }
  };

  test("RF-41: without stock, Sin stock and everything disabled", async () => {
    await renderProduct(2);
    expect(screen.getByText("Sin stock")).toBeOnTheScreen();
    expectAllDisabled();
  });

  test("RF-41: with 5 in the cart, Máximo 5 por producto and everything disabled", async () => {
    await renderProduct(1, [{ productId: 1, name: "Pack Mediano", quantity: 5 }]);
    expect(screen.getByText("Máximo 5 por producto")).toBeOnTheScreen();
    expectAllDisabled();
  });

  test("RF-41: with every unit left in the cart, No quedan más unidades and everything disabled", async () => {
    await renderProduct(3, [{ productId: 3, name: "Maple Mediano", quantity: 3 }]);
    expect(screen.getByText("No quedan más unidades")).toBeOnTheScreen();
    expectAllDisabled();
  });

  test("RF-41: with an active order, Ya tenés un pedido en curso and everything disabled", async () => {
    mockActiveOrder.current = { data: { id: 8, status: "pending" }, refetch: jest.fn() };
    await renderProduct(1);
    expect(screen.getByText("Ya tenés un pedido en curso")).toBeOnTheScreen();
    expectAllDisabled();
  });

  test("RF-42: the Shop and the active order refresh when the screen gains focus again", async () => {
    await renderProduct(1);
    expect(mockFocusRefreshes).toContain(mockShop.current.refetch);
    expect(mockFocusRefreshes).toContain(mockActiveOrder.current.refetch);
  });

  test("RF-42: with fewer units after a refresh, the price and the quantity follow", async () => {
    const view = await renderProduct(1);
    for (let tap = 0; tap < 3; tap++) await fireEvent.press(plus());
    expect(quantity()).toHaveProp("accessibilityLabel", "Cantidad: 4");

    mockShop.current = {
      ...mockShop.current,
      data: [{ ...PRODUCTS[0], price: 11000, units_available: 2 }, PRODUCTS[1], PRODUCTS[2]],
    };
    await view.rerender(tree());
    expect(screen.getByText("$11.000")).toBeOnTheScreen();
    expect(screen.getByText("Quedan 2")).toBeOnTheScreen();
    expect(quantity()).toHaveProp("accessibilityLabel", "Cantidad: 2");
    await fireEvent.press(button("Agregar al carrito"));
    expect(cartButton()).toHaveProp("accessibilityLabel", "Carrito, 2 productos");
  });

  test("RF-43: a product that is no longer in the Shop says so, with a way back", async () => {
    await renderProduct(99);
    expect(screen.getByText("Este producto ya no está a la venta")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Comprar" })).toBeNull();
    await fireEvent.press(button("Volver a la Tienda"));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  // T14 (harden): a second tap while the screen is leaving adds nothing and does not navigate again.
  test.each(["Comprar", "Agregar al carrito"])("RF-39, RF-40: a double tap on %s adds once and navigates once", async (name) => {
    await renderProduct(1);
    await fireEvent.press(button(name));
    await fireEvent.press(button(name));
    expect(cartButton()).toHaveProp("accessibilityLabel", "Carrito, 1 producto");
    expect(mockRouter.push.mock.calls.length + mockRouter.back.mock.calls.length).toBe(1);
  });

  test("RF-40: back from the checkout, the buttons work again", async () => {
    await renderProduct(1);
    await fireEvent.press(button("Comprar"));
    // The screen gains focus again: the last registered focus effect runs.
    await act(async () => mockFocusEffects.at(-1)?.());
    await fireEvent.press(button("Comprar"));
    expect(cartButton()).toHaveProp("accessibilityLabel", "Carrito, 2 productos");
    expect(mockRouter.push).toHaveBeenCalledTimes(2);
  });

  test("a refresh that fails keeps the product it already has", async () => {
    mockShop.current = { data: PRODUCTS, isPending: false, isError: true, refetch: jest.fn() };
    await renderProduct(1);
    expect(screen.getByRole("header", { name: "Pack Mediano" })).toBeOnTheScreen();
    expect(screen.queryByText("No pudimos cargar el producto")).toBeNull();
  });

  test("while the Shop loads, and when it fails, with retry", async () => {
    mockShop.current = { data: undefined, isPending: true, isError: false, refetch: jest.fn() };
    const view = await renderProduct(1);
    expect(screen.getByLabelText("Cargando")).toBeOnTheScreen();

    const refetch = jest.fn();
    mockShop.current = { data: undefined, isPending: false, isError: true, refetch };
    await view.rerender(tree());
    expect(screen.getByText("No pudimos cargar el producto")).toBeOnTheScreen();
    await fireEvent.press(button("Reintentar"));
    expect(refetch).toHaveBeenCalled();
  });

  test("the controls are at least 48 pt and the buttons say what they do", async () => {
    await renderProduct(1);
    for (const control of [minus(), plus(), button("Volver")]) {
      expect(control).toHaveStyle({ width: 48, height: 48 });
    }
    for (const control of [button("Agregar al carrito"), button("Comprar")]) {
      expect(control).toHaveStyle({ minHeight: 56 });
    }
  });
});

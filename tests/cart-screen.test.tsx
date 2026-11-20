import { fireEvent, render, screen, within } from "@testing-library/react-native";
import { Alert } from "react-native";

import CartScreen from "@/app/client/(tabs)/cart";
import { CartProvider } from "@/lib/cart";
import type { Cart } from "@/logic/cart";

// Spec 004 · T9: the cart screen (RF-14 to RF-18), a tab since spec 010 · T5 (RF-11 to RF-13). Prices
// and units come from the last Shop update (the hook is replaced); the cart is the real one, started
// with `initialItems`.
const PRODUCTS = [
  { id: 1, name: "Pack Mediano", description: null, price: 10500, format_id: 2, format_name: "Pack", format_eggs: 180, units_available: 3, available: true },
  { id: 2, name: "Maple Super", description: null, price: 3600, format_id: 1, format_name: "Maple", format_eggs: 30, units_available: 1, available: true },
  { id: 3, name: "Media docena", description: null, price: 1200, format_id: 3, format_name: "Media docena", format_eggs: 6, units_available: 20, available: true },
];

const mockShop = { current: { data: PRODUCTS as unknown[] | undefined, isPending: false, isError: false, refetch: jest.fn() } };
const mockActiveOrder = { current: { data: null, refetch: jest.fn() } };
const mockFocusRefreshes: unknown[] = [];
const mockRouter = { push: jest.fn(), back: jest.fn(), navigate: jest.fn() };
jest.mock("@/lib/catalog", () => ({ useShopProducts: () => mockShop.current }));
jest.mock("@/lib/orders", () => ({ useActiveOrder: () => mockActiveOrder.current }));
jest.mock("@/lib/use-refresh-on-focus", () => ({
  useRefreshOnFocus: (refetch: unknown) => mockFocusRefreshes.push(refetch),
}));
jest.mock("expo-router", () => ({
  router: {
    push: (...args: unknown[]) => mockRouter.push(...args),
    back: () => mockRouter.back(),
    navigate: (...args: unknown[]) => mockRouter.navigate(...args),
  },
}));

const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});

beforeEach(() => {
  mockShop.current = { data: PRODUCTS, isPending: false, isError: false, refetch: jest.fn() };
  mockActiveOrder.current = { data: null, refetch: jest.fn() };
  mockFocusRefreshes.length = 0;
  mockRouter.push.mockClear();
  mockRouter.back.mockClear();
  mockRouter.navigate.mockClear();
  alert.mockClear();
});

const renderCart = (items: Cart) =>
  render(
    <CartProvider initialItems={items}>
      <CartScreen />
    </CartProvider>,
  );
const line = (name: string) => screen.getByTestId(`cart-line-${name}`);
const continueButton = () => screen.getByRole("button", { name: "Continuar" });

describe("Cart screen", () => {
  test("RF-14: each line with its price per unit, quantity and subtotal, and the total", async () => {
    await renderCart([
      { productId: 1, name: "Pack Mediano", quantity: 2 },
      { productId: 3, name: "Media docena", quantity: 1 },
    ]);
    expect(within(line("Pack Mediano")).getByText("$10.500 c/u")).toBeOnTheScreen();
    expect(within(line("Pack Mediano")).getByText("$21.000")).toBeOnTheScreen();
    expect(within(line("Pack Mediano")).getByLabelText("2 unidades")).toBeOnTheScreen();
    expect(within(line("Media docena")).getByText("$1.200")).toBeOnTheScreen();
    expect(screen.getByLabelText("Total $22.200")).toBeOnTheScreen();
    expect(continueButton()).toBeEnabled();
  });

  test("RF-14: Continuar opens the checkout", async () => {
    await renderCart([{ productId: 1, name: "Pack Mediano", quantity: 1 }]);
    await fireEvent.press(continueButton());
    expect(mockRouter.push).toHaveBeenCalledWith("/client/checkout");
  });

  test("RF-14: + adds a unit and updates the subtotal and the total", async () => {
    await renderCart([{ productId: 3, name: "Media docena", quantity: 1 }]);
    await fireEvent.press(screen.getByRole("button", { name: "Agregar una unidad de Media docena" }));
    expect(within(line("Media docena")).getByLabelText("2 unidades")).toBeOnTheScreen();
    expect(screen.getByLabelText("Total $2.400")).toBeOnTheScreen();
  });

  test("RF-11: + keeps the limit of 5 per product, with a notice", async () => {
    await renderCart([{ productId: 3, name: "Media docena", quantity: 5 }]);
    await fireEvent.press(screen.getByRole("button", { name: "Agregar una unidad de Media docena" }));
    expect(alert).toHaveBeenCalledWith("Máximo 5 por producto");
    expect(within(line("Media docena")).getByLabelText("5 unidades")).toBeOnTheScreen();
  });

  test("RF-12: + keeps the units left, with a notice", async () => {
    await renderCart([{ productId: 1, name: "Pack Mediano", quantity: 3 }]);
    await fireEvent.press(screen.getByRole("button", { name: "Agregar una unidad de Pack Mediano" }));
    expect(alert).toHaveBeenCalledWith("No quedan más unidades");
  });

  test("RF-15: − on a line with 1 unit removes it", async () => {
    await renderCart([
      { productId: 1, name: "Pack Mediano", quantity: 2 },
      { productId: 3, name: "Media docena", quantity: 1 },
    ]);
    await fireEvent.press(screen.getByRole("button", { name: "Quitar una unidad de Media docena" }));
    expect(screen.queryByTestId("cart-line-Media docena")).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: "Quitar una unidad de Pack Mediano" }));
    expect(within(line("Pack Mediano")).getByLabelText("1 unidad")).toBeOnTheScreen();
  });

  test("RF-18: a line with fewer units left says how many, and Continuar waits for the client to fix it", async () => {
    await renderCart([{ productId: 2, name: "Maple Super", quantity: 2 }]);
    expect(within(line("Maple Super")).getByText("Queda 1")).toBeOnTheScreen();
    expect(screen.getByText("Corregí los productos marcados para continuar")).toBeOnTheScreen();
    expect(continueButton()).toBeDisabled();

    await fireEvent.press(screen.getByRole("button", { name: "Quitar una unidad de Maple Super" }));
    expect(within(line("Maple Super")).queryByText("Queda 1")).toBeNull();
    expect(screen.queryByText("Corregí los productos marcados para continuar")).toBeNull();
    expect(continueButton()).toBeEnabled();
  });

  test("RF-18: a product that left the Shop is not for sale; it only can be removed and does not count", async () => {
    await renderCart([
      { productId: 9, name: "Maple Viejo", quantity: 2 },
      { productId: 1, name: "Pack Mediano", quantity: 1 },
    ]);
    expect(within(line("Maple Viejo")).getByText("Ya no está a la venta")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Agregar una unidad de Maple Viejo" })).toBeNull();
    expect(screen.getByLabelText("Total $10.500")).toBeOnTheScreen();
    expect(continueButton()).toBeDisabled();

    await fireEvent.press(screen.getByRole("button", { name: "Quitar una unidad de Maple Viejo" }));
    await fireEvent.press(screen.getByRole("button", { name: "Quitar una unidad de Maple Viejo" }));
    expect(screen.queryByTestId("cart-line-Maple Viejo")).toBeNull();
    expect(continueButton()).toBeEnabled();
  });

  test("spec 010, RF-13: an empty cart says so, and Ver productos opens the Home", async () => {
    await renderCart([]);
    expect(screen.getByText("Tu carrito está vacío")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Continuar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Volver a la Tienda" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Ver productos" }));
    expect(mockRouter.navigate).toHaveBeenCalledWith("/client");
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  test("spec 010, RF-12: a tab root, titled Carrito, without back, empty or not", async () => {
    const view = await renderCart([{ productId: 1, name: "Pack Mediano", quantity: 1 }]);
    expect(screen.getByRole("header", { name: "Carrito" })).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Volver" })).toBeNull();
    await view.rerender(
      <CartProvider initialItems={[]}>
        <CartScreen />
      </CartProvider>,
    );
    expect(screen.queryByRole("button", { name: "Volver" })).toBeNull();
  });

  test("spec 010, RF-34: the products and the active order refresh when the tab gains focus again", async () => {
    await renderCart([]);
    expect(mockFocusRefreshes).toContain(mockShop.current.refetch);
    expect(mockFocusRefreshes).toContain(mockActiveOrder.current.refetch);
  });

  test("while the Shop loads, a loading state instead of lines without price", async () => {
    mockShop.current = { data: undefined, isPending: true, isError: false, refetch: jest.fn() };
    await renderCart([{ productId: 1, name: "Pack Mediano", quantity: 1 }]);
    expect(screen.getByLabelText("Cargando")).toBeOnTheScreen();
    expect(screen.queryByText("Ya no está a la venta")).toBeNull();
  });
});

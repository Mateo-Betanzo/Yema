import { fireEvent, render, screen, within } from "@testing-library/react-native";
import type { ComponentProps } from "react";
import { Alert, Text } from "react-native";

import { ShopCatalog } from "@/components/shop-catalog";
import { CartProvider, useCart } from "@/lib/cart";

// The list of the Shop, in its own component since spec 010 · T3 so the Home can show it (RF-2). The
// tests of spec 003 · T10 (RF-26 to RF-31) and spec 004 · T8 (RF-5, RF-8 to RF-12, RF-36) that are
// about the list, without the cart bar. The hooks are replaced; the data is what shop_products()
// returns, already in order. The cart is the real one, read by a probe. /feature 2026-11-18: a grid of
// two columns with "Agregar" on each card (no description: only the detail has it), and "Tu más comprado" on top of the section of its format.
const PRODUCTS = [
  { id: 4, name: "Media docena Super", description: null, price: 1200, format_id: 3, format_name: "Media docena", format_eggs: 6, units_available: 20, available: true },
  { id: 2, name: "Maple Grande", description: "30 huevos grandes", price: 4000, format_id: 1, format_name: "Maple", format_eggs: 30, units_available: 0, available: false },
  { id: 3, name: "Maple Mediano", description: null, price: 3500, format_id: 1, format_name: "Maple", format_eggs: 30, units_available: 12, available: true },
  { id: 1, name: "Pack Mediano", description: "6 maples medianos", price: 10500, format_id: 2, format_name: "Pack", format_eggs: 180, units_available: 2, available: true },
];

const mockShop = { current: { data: PRODUCTS as unknown[] | undefined, isPending: false, isError: false, refetch: jest.fn() } };
const mockActiveOrder = { current: { data: null as { id: number; status: string } | null, refetch: jest.fn() } };

jest.mock("@/lib/catalog", () => ({ useShopProducts: () => mockShop.current }));
jest.mock("@/lib/orders", () => ({ useActiveOrder: () => mockActiveOrder.current }));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({ router: { push: (...args: unknown[]) => mockPush(...args) } }));

const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});

beforeEach(() => {
  mockShop.current = { data: PRODUCTS, isPending: false, isError: false, refetch: jest.fn() };
  mockActiveOrder.current = { data: null, refetch: jest.fn() };
  alert.mockClear();
  mockPush.mockClear();
});

function CartProbe() {
  const cart = useCart();
  const units = cart.items.reduce((sum, item) => sum + item.quantity, 0);
  return <Text testID="cart-units">{units}</Text>;
}

// The generated types of shop_products() have no nulls (MEMORY.md): a product without description is cast.
const tree = (featured: (typeof PRODUCTS)[number] | null = null) => (
  <CartProvider>
    <ShopCatalog featured={featured as ComponentProps<typeof ShopCatalog>["featured"]} />
    <CartProbe />
  </CartProvider>
);
const renderCatalog = (featured: (typeof PRODUCTS)[number] | null = null) => render(tree(featured));
const sectionTitles = () => screen.getAllByRole("header").map((node) => node.props.children);
const addButton = (name: string) => screen.getByRole("button", { name: `Agregar ${name}` });
const cartUnits = () => screen.getByTestId("cart-units").props.children;

describe("ShopCatalog", () => {
  test("RF-26: the products grouped by format, from fewer eggs to more, with name and price; no description", async () => {
    await renderCatalog();
    expect(sectionTitles()).toEqual(["Media docena", "Maple", "Pack"]);
    expect(screen.getByText("Pack Mediano")).toBeOnTheScreen();
    expect(screen.queryByText("6 maples medianos")).toBeNull();
    expect(screen.getByText("$10.500")).toBeOnTheScreen();
  });

  test("RF-27: filters with Todos and each format, in the same order; one shows only its products", async () => {
    await renderCatalog();
    const chips = screen.getAllByRole("button", { name: /^(Todos|Media docena|Maple|Pack)$/ });
    expect(chips.map((chip) => chip.props.accessibilityLabel)).toEqual(["Todos", "Media docena", "Maple", "Pack"]);
    expect(screen.getByRole("button", { name: "Todos" })).toBeSelected();

    await fireEvent.press(screen.getByRole("button", { name: "Maple" }));
    expect(sectionTitles()).toEqual(["Maple"]);
    expect(screen.queryByText("Pack Mediano")).toBeNull();
    expect(screen.getByText("Maple Grande")).toBeOnTheScreen();
  });

  test("RF-5: each product says how many units are left, and Sin stock in text when none", async () => {
    await renderCatalog();
    expect(screen.getByRole("button", { name: "Pack Mediano, $10.500, Quedan 2" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Media docena Super, $1.200, Quedan 20" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Maple Grande, $4.000, Sin stock" })).toBeOnTheScreen();
  });

  test("RF-8: Agregar adds a unit to the cart", async () => {
    await renderCatalog();
    expect(cartUnits()).toBe(0);
    await fireEvent.press(addButton("Pack Mediano"));
    await fireEvent.press(addButton("Media docena Super"));
    expect(cartUnits()).toBe(2);
  });

  test("RF-10: Agregar of a product without stock is disabled", async () => {
    await renderCatalog();
    expect(addButton("Maple Grande")).toBeDisabled();
    await fireEvent.press(addButton("Maple Grande"));
    expect(cartUnits()).toBe(0);
  });

  test("RF-11, RF-12: the limits of the cart, with a notice", async () => {
    await renderCatalog();
    for (let tap = 0; tap < 3; tap++) await fireEvent.press(addButton("Pack Mediano"));
    expect(alert).toHaveBeenCalledWith("No quedan más unidades");
    for (let tap = 0; tap < 6; tap++) await fireEvent.press(addButton("Media docena Super"));
    expect(alert).toHaveBeenCalledWith("Máximo 5 por producto");
    expect(cartUnits()).toBe(7);
  });

  // Spec 003 · T13 (cambio del 2026-11-18): the detail is a screen, not a modal.
  test("RF-29: a product opens its screen, without adding anything", async () => {
    await renderCatalog();
    await fireEvent.press(screen.getByRole("button", { name: /^Pack Mediano,/ }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/client/product/[id]", params: { id: "1" } });
    expect(screen.queryByTestId("product-detail")).toBeNull();
    expect(cartUnits()).toBe(0);
  });

  test("RF-29: Tu más comprado opens its screen too", async () => {
    await renderCatalog(PRODUCTS[2]);
    await fireEvent.press(within(screen.getByTestId("product-card-wide")).getByRole("button", { name: /^Maple Mediano,/ }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/client/product/[id]", params: { id: "3" } });
  });

  test("RF-36: with an active order, a notice and every Agregar disabled; the products still show", async () => {
    mockActiveOrder.current = { data: { id: 8, status: "pending" }, refetch: jest.fn() };
    await renderCatalog();
    expect(screen.getByText("Ya tenés un pedido en curso")).toBeOnTheScreen();
    expect(screen.getByText("Pack Mediano")).toBeOnTheScreen();
    for (const name of ["Media docena Super", "Maple Mediano", "Pack Mediano"]) {
      expect(addButton(name)).toBeDisabled();
    }

    // The product screen still opens: it says why it cannot add (RF-41).
    await fireEvent.press(screen.getByRole("button", { name: /^Pack Mediano,/ }));
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  test("without an active order there is no notice", async () => {
    await renderCatalog();
    expect(screen.queryByText("Ya tenés un pedido en curso")).toBeNull();
  });

  test("spec 003 RF-31 (changed on 2026-11-18): the cards of the Shop have no image", async () => {
    await renderCatalog(PRODUCTS[3]);
    expect(screen.getAllByTestId("product-card")).toHaveLength(4);
    expect(screen.queryAllByTestId("egg-image", { includeHiddenElements: true })).toHaveLength(0);
  });

  test("RF-30: with no products, an empty state explains it", async () => {
    mockShop.current = { data: [], isPending: false, isError: false, refetch: jest.fn() };
    await renderCatalog();
    expect(screen.getByText("Todavía no hay productos en la Tienda")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Todos" })).toBeNull();
  });

  test("while loading, and when it fails, with retry", async () => {
    mockShop.current = { data: undefined, isPending: true, isError: false, refetch: jest.fn() };
    const view = await renderCatalog();
    expect(screen.getByLabelText("Cargando")).toBeOnTheScreen();

    const refetch = jest.fn();
    mockShop.current = { data: undefined, isPending: false, isError: true, refetch };
    await view.rerender(tree());
    expect(screen.getByText("No pudimos cargar la Tienda")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Reintentar" }));
    expect(refetch).toHaveBeenCalled();
  });

  test("the grid: the products of each format two by two, an odd one in half a row", async () => {
    await renderCatalog();
    const rows = screen.getAllByTestId("shop-row");
    expect(rows.map((row) => within(row).queryAllByTestId("product-card").length)).toEqual([1, 2, 1]);
    expect(within(rows[0]).getByTestId("shop-row-spacer")).toBeOnTheScreen();
    expect(within(rows[1]).queryByTestId("shop-row-spacer")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Comprar/ })).toBeNull();
  });

  test("Tu más comprado: below the filters, right above the section of its format, the whole width, and again in it", async () => {
    await renderCatalog(PRODUCTS[2]);
    expect(sectionTitles()).toEqual(["Media docena", "Tu más comprado", "Maple", "Pack"]);
    expect(within(screen.getByTestId("product-card-wide")).getByText("Maple Mediano")).toBeOnTheScreen();
    expect(screen.getAllByText("Maple Mediano")).toHaveLength(2);
  });

  test("Tu más comprado shows only with Todos: any format filter, also its own, leaves it out", async () => {
    await renderCatalog(PRODUCTS[2]);
    await fireEvent.press(screen.getByRole("button", { name: "Maple" }));
    expect(sectionTitles()).toEqual(["Maple"]);
    expect(screen.queryByTestId("product-card-wide")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Pack" }));
    expect(screen.queryByTestId("product-card-wide")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Todos" }));
    expect(screen.getByTestId("product-card-wide")).toBeOnTheScreen();
  });

  test("Agregar of Tu más comprado adds to the cart, with the same limits", async () => {
    await renderCatalog(PRODUCTS[3]);
    const buy = within(screen.getByTestId("product-card-wide")).getByRole("button", { name: "Agregar Pack Mediano" });
    for (let tap = 0; tap < 3; tap++) await fireEvent.press(buy);
    expect(cartUnits()).toBe(2);
    expect(alert).toHaveBeenCalledWith("No quedan más unidades");
  });

  test("Tu más comprado without stock shows it and its Agregar is disabled", async () => {
    await renderCatalog(PRODUCTS[1]);
    const wide = screen.getByTestId("product-card-wide");
    expect(within(wide).getByText("Sin stock")).toBeOnTheScreen();
    expect(within(wide).getByRole("button", { name: "Agregar Maple Grande" })).toBeDisabled();
  });

  test("without a product bought before, nothing on top", async () => {
    await renderCatalog(null);
    expect(screen.queryByText("Tu más comprado")).toBeNull();
    expect(screen.queryByTestId("product-card-wide")).toBeNull();
  });
});

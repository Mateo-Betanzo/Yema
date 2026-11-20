import { fireEvent, render, screen, within } from "@testing-library/react-native";
import { Alert } from "react-native";

import ClientHome from "@/app/client/(tabs)/index";
import { CartProvider } from "@/lib/cart";

// The client Home, which since spec 010 · T4 is the Shop (RF-2 to RF-10, RF-32, RF-33): the greeting
// with the cart button, the card of spec 006 (RF-2 to RF-4, RF-10, RF-11) and the list of the Shop
// (ShopCatalog, tested on its own in shop-catalog.test.tsx). The hooks are replaced; the card comes
// from the real functions of logic/client-orders.ts. Only Date is faked: "now" is Friday 13 November
// 2026 at 12:00 in Buenos Aires. The cart is the real one.
const NOW = new Date("2026-11-13T15:00:00Z");
const HOUR = 60 * 60 * 1000;
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

beforeAll(() => {
  jest.useFakeTimers({
    now: NOW,
    doNotFake: [
      "hrtime",
      "nextTick",
      "performance",
      "queueMicrotask",
      "requestAnimationFrame",
      "cancelAnimationFrame",
      "requestIdleCallback",
      "cancelIdleCallback",
      "setImmediate",
      "clearImmediate",
      "setInterval",
      "clearInterval",
      "setTimeout",
      "clearTimeout",
    ],
  });
});
afterAll(() => jest.useRealTimers());

let nextId = 100;
const item = (product_id: number, name: string, quantity = 1) => ({
  product_id,
  name,
  egg_type_name: name.split(" ")[1] ?? name,
  format_name: name.split(" ")[0],
  quantity,
  unit_price: 5000,
});
const order = (fields: Record<string, unknown>) => ({
  id: nextId++,
  status: "delivered",
  status_reason: null,
  cancelled_by: null,
  delivery_date: "2026-11-10",
  slot_starts_at: "09:00:00",
  slot_ends_at: "11:00:00",
  total: 10000,
  address: "Calle 1",
  address_notes: null,
  created_at: ago(30 * HOUR),
  accepted_at: null,
  on_the_way_at: null,
  delivered_at: null,
  rejected_at: null,
  cancelled_at: null,
  units: 2,
  items: [item(1, "Maple Medianos", 2)],
  ...fields,
});

const DELIVERED = order({ id: 150, delivered_at: ago(2 * HOUR), items: [item(1, "Maple Medianos", 2), item(2, "Pack Grandes")] });
const REJECTED = order({ id: 140, status: "rejected", rejected_at: ago(26 * HOUR), status_reason: "Fuera de zona", total: 5000 });
const ACTIVE = order({ id: 187, status: "on_the_way", accepted_at: ago(HOUR), on_the_way_at: ago(HOUR / 2) });

const product = (id: number, name: string, fields: Record<string, unknown> = {}) => ({
  id,
  name,
  description: null,
  price: 10000,
  format_id: 1,
  format_name: "Maple",
  format_eggs: 30,
  units_available: 6,
  available: true,
  ...fields,
});
const PRODUCTS = [product(1, "Maple Medianos"), product(2, "Pack Grandes", { available: false, units_available: 0 })];

type Query = { data: unknown; isPending: boolean; isError: boolean; isRefetching: boolean; refetch: jest.Mock };
const query = (data: unknown): Query => ({ data, isPending: false, isError: false, isRefetching: false, refetch: jest.fn() });
const mockOrders: { current: Query } = { current: query([]) };
const mockShop: { current: Query } = { current: query(PRODUCTS) };
const mockActiveOrder: { current: Query } = { current: query(null) };
const mockRealtime = jest.fn();
const mockFocusRefreshes: unknown[] = [];
const mockPush = jest.fn();
const mockNavigate = jest.fn();

jest.mock("@/lib/client-orders", () => ({
  clientOrderKeys: { all: ["client-orders"] },
  useClientOrders: () => mockOrders.current,
}));
jest.mock("@/lib/catalog", () => ({
  catalogKeys: { shopProducts: ["shop-products"] },
  useShopProducts: () => mockShop.current,
}));
jest.mock("@/lib/orders", () => ({
  orderKeys: { activeOrder: ["active-order"] },
  useActiveOrder: () => mockActiveOrder.current,
  useOrdersRealtime: (...args: unknown[]) => mockRealtime(...args),
}));
jest.mock("@/lib/session", () => ({ useSession: () => ({ profile: { first_name: "Mateo" } }) }));
jest.mock("@/lib/use-refresh-on-focus", () => ({
  useRefreshOnFocus: (refetch: unknown) => mockFocusRefreshes.push(refetch),
}));
jest.mock("expo-router", () => ({
  router: {
    push: (...args: unknown[]) => mockPush(...args),
    navigate: (...args: unknown[]) => mockNavigate(...args),
    back: jest.fn(),
  },
}));

const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});

beforeEach(() => {
  mockOrders.current = query([ACTIVE, DELIVERED, REJECTED]);
  mockShop.current = query(PRODUCTS);
  mockActiveOrder.current = query(null);
  mockRealtime.mockClear();
  mockFocusRefreshes.length = 0;
  mockPush.mockClear();
  mockNavigate.mockClear();
  alert.mockClear();
});

const renderHome = () =>
  render(
    <CartProvider>
      <ClientHome />
    </CartProvider>,
  );
const cartButton = (name: string | RegExp) => screen.getByRole("button", { name });
const badge = () => screen.queryByTestId("header-badge", { includeHiddenElements: true });
// The card of the grid; with a delivered order the same product is also on top ("Tu más comprado").
const buy = (name: string) => screen.getAllByRole("button", { name: `Agregar ${name}` }).at(-1)!;
const opened = () => mockPush.mock.calls.map(([href]) => href);

describe("Client Home", () => {
  test("RF-2: greets the client by name, with the cart button on the right", async () => {
    await renderHome();
    expect(screen.getByRole("header", { name: "Hola, Mateo" })).toBeOnTheScreen();
    expect(cartButton("Carrito vacío")).toBeOnTheScreen();
  });

  test("RF-2: below the greeting, the card and then the Shop", async () => {
    await renderHome();
    expect(screen.getByText("Pedido en camino")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Todos" })).toBeOnTheScreen();
    expect(screen.getAllByText("Maple Medianos").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("header").map((node) => node.props.children)).toEqual(["Hola, Mateo", "Tu más comprado", "Maple"]);
  });

  test("RF-2, spec 006 RF-4: the active order on the card opens its detail", async () => {
    await renderHome();
    await fireEvent.press(screen.getByRole("button", { name: /^Pedido en camino/ }));
    expect(opened()).toEqual([{ pathname: "/client/order/[id]", params: { id: "187" } }]);
  });

  test("RF-2, spec 006 RF-10, RF-11: without an active order, the last finished one, until Ocultar", async () => {
    mockOrders.current = query([DELIVERED, REJECTED]);
    await renderHome();
    expect(screen.getByText("Pedido entregado")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Ocultar" }));
    expect(screen.queryByText("Pedido entregado")).toBeNull();
    expect(screen.queryByText("Pedido rechazado")).toBeNull();
    expect(screen.queryByTestId("client-order-card")).toBeNull();
    expect(screen.getAllByText("Maple Medianos").length).toBeGreaterThan(0);
  });

  test("RF-3: no order to show, no card: the filters and the products start below the greeting", async () => {
    mockOrders.current = query([]);
    await renderHome();
    expect(screen.queryByTestId("client-order-card")).toBeNull();
    expect(screen.queryByText("No tenés pedidos en curso")).toBeNull();
    expect(screen.queryByRole("button", { name: "Ir a la Tienda" })).toBeNull();
    expect(screen.getByRole("button", { name: "Todos" })).toBeOnTheScreen();
  });

  test("RF-4, RF-5: no Volver a comprar, no history and no cart bar, even with products in the cart", async () => {
    mockOrders.current = query([DELIVERED, REJECTED]);
    await renderHome();
    await fireEvent.press(buy("Maple Medianos"));
    expect(screen.queryByText("Volver a comprar")).toBeNull();
    expect(screen.queryByText("Historial de compras")).toBeNull();
    expect(screen.queryByTestId("history")).toBeNull();
    expect(screen.queryByTestId("cart-bar")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Ver carrito/ })).toBeNull();
  });

  test("RF-7 to RF-9: the + of the Shop updates the number and the label of the cart button", async () => {
    mockOrders.current = query([DELIVERED]);
    await renderHome();
    expect(badge()).toBeNull();

    await fireEvent.press(buy("Maple Medianos"));
    expect(cartButton("Carrito, 1 producto")).toBeOnTheScreen();
    expect(badge()).toHaveTextContent("1");

    await fireEvent.press(buy("Maple Medianos"));
    await fireEvent.press(buy("Maple Medianos"));
    expect(cartButton("Carrito, 3 productos")).toBeOnTheScreen();
    expect(badge()).toHaveTextContent("3");
  });

  test("RF-10: the cart button opens the Carrito tab", async () => {
    await renderHome();
    await fireEvent.press(cartButton("Carrito vacío"));
    expect(mockNavigate).toHaveBeenCalledWith("/client/cart");
  });

  test("with an active order the Shop does not let the client add", async () => {
    mockActiveOrder.current = query({ id: 187, status: "on_the_way" });
    await renderHome();
    expect(screen.getByText("Ya tenés un pedido en curso")).toBeOnTheScreen();
    expect(buy("Maple Medianos")).toBeDisabled();
  });

  test("RF-6: the Home listens to the orders through Realtime: the card, the active order and the Shop", async () => {
    await renderHome();
    expect(mockRealtime).toHaveBeenCalledWith("client-orders", [["client-orders"], ["active-order"], ["shop-products"]]);
  });

  test("RF-6: the orders, the active order and the Shop refresh on focus and when the Home is pulled down", async () => {
    await renderHome();
    expect(mockFocusRefreshes).toEqual(
      expect.arrayContaining([mockOrders.current.refetch, mockShop.current.refetch, mockActiveOrder.current.refetch]),
    );
    screen.getByTestId("keyboard-scroll").props.refreshControl.props.onRefresh();
    expect(mockOrders.current.refetch).toHaveBeenCalled();
    expect(mockShop.current.refetch).toHaveBeenCalled();
    expect(mockActiveOrder.current.refetch).toHaveBeenCalled();
  });

  test("RF-32: when the orders fail, a notice with Reintentar in place of the card, and the Shop below", async () => {
    mockOrders.current = { ...query(undefined), isError: true };
    await renderHome();
    expect(screen.getByText("No pudimos cargar tu pedido")).toBeOnTheScreen();
    expect(screen.getAllByText("Maple Medianos").length).toBeGreaterThan(0);
    await fireEvent.press(screen.getByRole("button", { name: "Reintentar" }));
    expect(mockOrders.current.refetch).toHaveBeenCalled();
    expect(mockShop.current.refetch).not.toHaveBeenCalled();
  });

  test("RF-33: one loading until the orders and the products are there", async () => {
    mockOrders.current = { ...query(undefined), isPending: true };
    const view = await renderHome();
    expect(screen.getAllByLabelText("Cargando")).toHaveLength(1);
    expect(screen.queryByText("Maple Medianos")).toBeNull();

    mockOrders.current = query([ACTIVE]);
    mockShop.current = { ...query(undefined), isPending: true };
    await view.rerender(
      <CartProvider>
        <ClientHome />
      </CartProvider>,
    );
    expect(screen.getAllByLabelText("Cargando")).toHaveLength(1);
    expect(screen.queryByText("Pedido en camino")).toBeNull();
  });

  test("when the products fail, the card shows and the Shop explains it, with retry", async () => {
    mockShop.current = { ...query(undefined), isError: true };
    await renderHome();
    expect(screen.getByText("Pedido en camino")).toBeOnTheScreen();
    expect(screen.getByText("No pudimos cargar la Tienda")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Reintentar" }));
    expect(mockShop.current.refetch).toHaveBeenCalled();
  });

  // /feature 2026-11-18: "Tu más comprado" comes from the orders of the client (mostBought).
  test("Tu más comprado: the product with the most units of the delivered orders, on top of the Shop", async () => {
    mockOrders.current = query([DELIVERED, REJECTED]);
    await renderHome();
    expect(within(screen.getByTestId("product-card-wide")).getByText("Maple Medianos")).toBeOnTheScreen();
  });

  test("without delivered orders, nothing on top of the Shop", async () => {
    mockOrders.current = query([ACTIVE, REJECTED]);
    await renderHome();
    expect(screen.queryByText("Tu más comprado")).toBeNull();
    expect(screen.queryByTestId("product-card-wide")).toBeNull();
  });
});

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import { Text } from "react-native";

import Checkout from "@/app/client/checkout";
import { CartProvider, useCart } from "@/lib/cart";
import type { Cart } from "@/logic/cart";
import { addDays, formatDayKey, toBuenosAiresDate } from "@/logic/dates";

// Spec 004 · T10: the checkout (RF-20 to RF-28, RF-31, RF-32). The hooks are replaced; the cart is the
// real one. The delivery days are built from the real date with the same functions the screen uses.
const PRODUCTS = [
  { id: 1, name: "Pack Mediano", description: null, price: 10500, format_id: 2, format_name: "Pack", format_eggs: 180, units_available: 3, available: true },
  { id: 3, name: "Media docena", description: null, price: 1200, format_id: 3, format_name: "Media docena", format_eggs: 6, units_available: 20, available: true },
];
const CART: Cart = [
  { productId: 1, name: "Pack Mediano", quantity: 2 },
  { productId: 3, name: "Media docena", quantity: 1 },
];

const today = toBuenosAiresDate(new Date());
const day = (offset: number) => addDays(today, offset);
const dayLabel = (offset: number) => formatDayKey(day(offset), new Date());
// Today: only a full slot (nothing to choose). Tomorrow: one free and one full. Then nothing.
const OPTIONS = [
  { delivery_date: day(0), slot_id: 1, starts_at: "18:00:00", ends_at: "21:00:00", is_full: true },
  { delivery_date: day(1), slot_id: 3, starts_at: "09:00:00", ends_at: "11:00:00", is_full: false },
  { delivery_date: day(1), slot_id: 4, starts_at: "18:00:00", ends_at: "21:00:00", is_full: true },
];

type Query<T> = { data: T; isPending: boolean; isError: boolean; refetch: jest.Mock };
const query = <T,>(data: T): Query<T> => ({ data, isPending: false, isError: false, refetch: jest.fn() });

const mockShop = { current: query(PRODUCTS as unknown[] | undefined) };
const mockOptions = { current: query(OPTIONS as unknown[] | undefined) };
const mockActiveOrder = { current: query(null as unknown) };
const mockCreate = { mutateAsync: jest.fn(), isPending: false };
const mockRouter = { replace: jest.fn(), back: jest.fn() };

jest.mock("@/lib/catalog", () => ({ useShopProducts: () => mockShop.current }));
jest.mock("@/lib/orders", () => ({
  useDeliveryOptions: () => mockOptions.current,
  useActiveOrder: () => mockActiveOrder.current,
  useCreateOrder: () => mockCreate,
}));
jest.mock("@/lib/session", () => ({
  useSession: () => ({ profile: { address: "Calle 1 234", address_notes: "Timbre B" } }),
}));
jest.mock("expo-router", () => ({
  router: { replace: (...args: unknown[]) => mockRouter.replace(...args), back: () => mockRouter.back() },
}));

beforeEach(() => {
  mockShop.current = query(PRODUCTS);
  mockOptions.current = query(OPTIONS);
  mockActiveOrder.current = query(null);
  mockCreate.mutateAsync = jest.fn();
  mockCreate.isPending = false;
  mockRouter.replace.mockClear();
  mockRouter.back.mockClear();
});

// Shows how many lines the cart has, next to the screen.
function CartCount() {
  return <Text testID="cart-count">{useCart().items.length}</Text>;
}

const renderCheckout = (items: Cart = CART) =>
  render(
    <CartProvider initialItems={items}>
      <Checkout />
      <CartCount />
    </CartProvider>,
  );
const confirmButton = () => screen.getByRole("button", { name: "Confirmar pedido" });
const chooseSlot = () => fireEvent.press(screen.getByRole("button", { name: "9 a 11 h" }));
const pg = (code: string, message: string, hint: string | null = null) => ({ code, message, hint, details: null });

describe("Checkout", () => {
  test("RF-20: the order with its total, the address of the profile and cash on delivery", async () => {
    await renderCheckout();
    expect(screen.getByText("2 × Pack Mediano")).toBeOnTheScreen();
    expect(screen.getByText("$21.000")).toBeOnTheScreen();
    expect(screen.getByText("1 × Media docena")).toBeOnTheScreen();
    expect(screen.getByLabelText("Total $22.200")).toBeOnTheScreen();
    expect(screen.getByText("Calle 1 234")).toBeOnTheScreen();
    expect(screen.getByText("Timbre B")).toBeOnTheScreen();
    expect(screen.getByText("Efectivo al recibir")).toBeOnTheScreen();
  });

  test("RF-21: the 7 delivery days; those with nothing to choose say Sin horarios and are disabled", async () => {
    await renderCheckout();
    const days = within(screen.getByLabelText("Día")).getAllByRole("button");
    expect(days).toHaveLength(7);
    expect(screen.getByRole("button", { name: `${dayLabel(0)} · Sin horarios` })).toBeDisabled();
    expect(screen.getByRole("button", { name: dayLabel(1) })).toBeEnabled();
    expect(screen.getByRole("button", { name: `${dayLabel(2)} · Sin horarios` })).toBeDisabled();
  });

  test("RF-21, RF-3: the first day with a slot comes chosen, with its slots; a full one says Completa", async () => {
    await renderCheckout();
    expect(screen.getByRole("button", { name: dayLabel(1) })).toBeSelected();
    expect(screen.getByRole("button", { name: "9 a 11 h" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "18 a 21 h · Completa" })).toBeDisabled();
  });

  test("RF-22: Confirmar pedido stays disabled until a slot is chosen", async () => {
    await renderCheckout();
    expect(confirmButton()).toBeDisabled();
    await chooseSlot();
    expect(screen.getByRole("button", { name: "9 a 11 h" })).toBeSelected();
    expect(confirmButton()).toBeEnabled();
  });

  test("RF-23: with an active order it says so and does not let the client confirm", async () => {
    mockActiveOrder.current = query({ id: 8, status: "pending" });
    await renderCheckout();
    await chooseSlot();
    expect(screen.getByText("Ya tenés un pedido en curso")).toBeOnTheScreen();
    expect(confirmButton()).toBeDisabled();
  });

  test("RF-24, RF-31: confirming sends the slot, the lines and the total seen, empties the cart and shows the confirmation", async () => {
    mockCreate.mutateAsync.mockResolvedValue({
      order_id: 12,
      delivery_date: day(1),
      starts_at: "09:00:00",
      ends_at: "11:00:00",
      total: 22200,
    });
    await renderCheckout();
    await chooseSlot();
    await fireEvent.press(confirmButton());

    expect(mockCreate.mutateAsync).toHaveBeenCalledWith({
      deliveryDate: day(1),
      slotId: 3,
      items: [
        { product_id: 1, quantity: 2 },
        { product_id: 3, quantity: 1 },
      ],
      expectedTotal: 22200,
    });
    await waitFor(() =>
      expect(mockRouter.replace).toHaveBeenCalledWith({
        pathname: "/client/order-confirmed",
        params: { date: day(1), startsAt: "09:00:00", endsAt: "11:00:00", total: "22200" },
      }),
    );
    expect(screen.getByTestId("cart-count")).toHaveTextContent("0");
  });

  test("while it is being sent, Confirmar pedido shows it and does not take another tap", async () => {
    mockCreate.isPending = true;
    await renderCheckout();
    await chooseSlot();
    expect(confirmButton()).toBeDisabled();
    expect(confirmButton()).toBeBusy();
  });

  test("RF-3, RF-28 (harden): if the refreshed slots fill the chosen one, Confirmar pedido waits for another", async () => {
    const view = await renderCheckout();
    await chooseSlot();
    expect(confirmButton()).toBeEnabled();

    mockOptions.current = query([{ ...OPTIONS[1], is_full: true }, OPTIONS[2], { ...OPTIONS[1], delivery_date: day(2), slot_id: 5 }]);
    await view.rerender(
      <CartProvider initialItems={CART}>
        <Checkout />
      </CartProvider>,
    );
    expect(confirmButton()).toBeDisabled();
  });

  test("RF-28: a slot that is no longer available is unselected, with a message, keeping the cart", async () => {
    mockCreate.mutateAsync.mockRejectedValue(pg("P0001", "slot_unavailable"));
    await renderCheckout();
    await chooseSlot();
    await fireEvent.press(confirmButton());

    expect(await screen.findByText("Esa franja ya no está disponible")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "9 a 11 h" })).not.toBeSelected();
    expect(confirmButton()).toBeDisabled();
    expect(screen.getByTestId("cart-count")).toHaveTextContent("2");
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  test.each([
    ["RF-25", pg("P0001", "price_changed"), "Cambiaron los precios, revisá tu carrito"],
    ["RF-26", pg("P0001", "not_enough_units", "Pack Mediano"), "No alcanzan las unidades de Pack Mediano"],
    ["RF-26", pg("P0001", "product_unavailable", "Media docena"), "Media docena ya no está a la venta"],
    ["RF-27", pg("P0001", "active_order_exists"), "Ya tenés un pedido en curso"],
  ])("%s: the error is explained and the cart stays", async (_rf, error, message) => {
    mockCreate.mutateAsync.mockRejectedValue(error);
    await renderCheckout();
    await chooseSlot();
    await fireEvent.press(confirmButton());
    expect(await screen.findByText(message)).toBeOnTheScreen();
    expect(screen.getByTestId("cart-count")).toHaveTextContent("2");
  });

  test("RF-32: without connection the cart and the chosen slot stay, so the client can retry", async () => {
    mockCreate.mutateAsync.mockRejectedValueOnce(pg("", "TypeError: Network request failed"));
    await renderCheckout();
    await chooseSlot();
    await fireEvent.press(confirmButton());

    expect(await screen.findByText("No hay conexión. Revisá tu internet e intentá de nuevo")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "9 a 11 h" })).toBeSelected();
    expect(confirmButton()).toBeEnabled();

    mockCreate.mutateAsync.mockResolvedValueOnce({ order_id: 1, delivery_date: day(1), starts_at: "09:00:00", ends_at: "11:00:00", total: 22200 });
    await fireEvent.press(confirmButton());
    expect(mockCreate.mutateAsync).toHaveBeenCalledTimes(2);
  });

  test("RF-25, RF-26: with a marked line after the refresh, Confirmar waits and the client can go back to the cart", async () => {
    mockShop.current = query([{ ...PRODUCTS[0], units_available: 1 }, PRODUCTS[1]]);
    await renderCheckout();
    await chooseSlot();
    expect(screen.getByText("Queda 1")).toBeOnTheScreen();
    expect(confirmButton()).toBeDisabled();
    await fireEvent.press(screen.getByRole("button", { name: "Revisar carrito" }));
    expect(mockRouter.back).toHaveBeenCalled();
  });

  test("no day with a slot to choose: a message instead of the days", async () => {
    mockOptions.current = query([OPTIONS[0]]);
    await renderCheckout();
    expect(screen.getByText("No hay horarios de entrega esta semana")).toBeOnTheScreen();
    expect(confirmButton()).toBeDisabled();
  });

  test("while the slots load, and when they fail, with retry", async () => {
    mockOptions.current = { ...query(undefined), isPending: true };
    const view = await renderCheckout();
    expect(screen.getByLabelText("Cargando")).toBeOnTheScreen();

    const refetch = jest.fn();
    mockOptions.current = { ...query(undefined), isError: true, refetch };
    await view.rerender(
      <CartProvider initialItems={CART}>
        <Checkout />
      </CartProvider>,
    );
    await fireEvent.press(screen.getByRole("button", { name: "Reintentar" }));
    expect(refetch).toHaveBeenCalled();
  });
});

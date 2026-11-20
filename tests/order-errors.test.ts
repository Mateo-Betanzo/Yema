import { orderErrorKind, orderErrorMessage } from "@/logic/order-errors";

// Spec 004 · T6: the errors of create_order as the supabase-js client delivers them (RF-25 to RF-28,
// RF-32). The kind tells the checkout what to refresh; the message is what the client reads.
const pg = (code: string, message: string, hint: string | null = null) => ({ code, message, hint, details: null });

describe("orderErrorKind and orderErrorMessage", () => {
  test.each([
    ["RF-27: an active order", pg("P0001", "active_order_exists"), "active_order", "Ya tenés un pedido en curso"],
    [
      "RF-27: two confirmations of the same client that raced",
      pg("23505", 'duplicate key value violates unique constraint "orders_one_active_per_client"'),
      "active_order",
      "Ya tenés un pedido en curso",
    ],
    ["RF-28: the slot is no longer offered", pg("P0001", "slot_unavailable"), "slot", "Esa franja ya no está disponible"],
    [
      "RF-26: a product left the Shop",
      pg("P0001", "product_unavailable", "Maple Super"),
      "product",
      "Maple Super ya no está a la venta",
    ],
    [
      "RF-26: a product that no longer exists has no name",
      pg("P0001", "product_unavailable", ""),
      "product",
      "Un producto ya no está a la venta",
    ],
    [
      "RF-26: not enough units",
      pg("P0001", "not_enough_units", "Pack Mediano"),
      "units",
      "No alcanzan las unidades de Pack Mediano",
    ],
    ["RF-25: prices changed", pg("P0001", "price_changed"), "price", "Cambiaron los precios, revisá tu carrito"],
    ["RF-32: no connection", pg("", "TypeError: Network request failed"), "network", "No hay conexión. Revisá tu internet e intentá de nuevo"],
    ["not a client", pg("42501", "forbidden"), "other", "No tenés permiso para hacer esto"],
    ["lines the app should never send", pg("P0001", "invalid_items"), "other", "No pudimos confirmar el pedido. Intentá de nuevo"],
    ["another unique index", pg("23505", 'duplicate key value violates unique constraint "x"'), "other", "No pudimos confirmar el pedido. Intentá de nuevo"],
    ["anything else", new Error("boom"), "other", "No pudimos confirmar el pedido. Intentá de nuevo"],
    ["nothing", null, "other", "No pudimos confirmar el pedido. Intentá de nuevo"],
  ])("%s", (_name, error, kind, message) => {
    expect(orderErrorKind(error)).toBe(kind);
    expect(orderErrorMessage(error)).toBe(message);
  });
});

import { orderStatusErrorKind, orderStatusErrorMessage, validateReason } from "@/logic/order-status-errors";

// Spec 005 · T4: the errors of set_order_status as supabase-js delivers them (RF-16, RF-17, RF-26), and
// the reason typed before rejecting or cancelling (RF-16).
const pg = (code: string, message: string, hint: string | null = null) => ({ code, message, hint, details: null });

describe("orderStatusErrorKind and orderStatusErrorMessage", () => {
  test.each([
    ["RF-17: the client cancelled it first", pg("P0001", "order_changed", "cancelled"), "changed", "Este pedido cambió: ahora está cancelado"],
    ["RF-17: already delivered (second tap)", pg("P0001", "order_changed", "delivered"), "changed", "Este pedido cambió: ahora está entregado"],
    ["RF-17: already on the way", pg("P0001", "order_changed", "on_the_way"), "changed", "Este pedido cambió: ahora está en camino"],
    ["RF-17: it no longer exists", pg("P0001", "order_changed", null), "changed", "Este pedido ya no existe"],
    [
      "RF-26: not enough eggs",
      pg("P0001", "not_enough_stock", "30|Medianos"),
      "stock",
      "No hay stock para entregar este pedido: faltan 30 huevos de Medianos",
    ],
    [
      "RF-26: one egg missing",
      pg("P0001", "not_enough_stock", "1|Super"),
      "stock",
      "No hay stock para entregar este pedido: falta 1 huevo de Super",
    ],
    ["RF-16: a cancellation without reason", pg("P0001", "reason_required"), "reason", "Escribí el motivo"],
    ["RF-16: a reason too long", pg("P0001", "reason_too_long"), "reason", "Usá hasta 120 caracteres"],
    ["no connection", pg("", "TypeError: Network request failed"), "network", "No hay conexión. Revisá tu internet e intentá de nuevo"],
    ["not the admin", pg("42501", "forbidden"), "other", "No tenés permiso para hacer esto"],
    ["anything else", new Error("boom"), "other", "No pudimos cambiar el pedido. Intentá de nuevo"],
  ])("%s", (_name, error, kind, message) => {
    expect(orderStatusErrorKind(error)).toBe(kind);
    expect(orderStatusErrorMessage(error)).toBe(message);
  });
});

describe("validateReason (RF-16)", () => {
  test("a reason is trimmed", () => {
    expect(validateReason("  Fuera de zona  ", true)).toEqual({ ok: true, reason: "Fuera de zona" });
  });

  test("an optional reason can be left empty (a rejection)", () => {
    expect(validateReason("   ", false)).toEqual({ ok: true, reason: null });
  });

  test("a required reason cannot (a cancellation)", () => {
    expect(validateReason("   ", true)).toEqual({ ok: false, error: "Escribí el motivo" });
  });

  test("up to 120 characters, counted as Postgres does (an emoji is one)", () => {
    expect(validateReason("m".repeat(120), true)).toEqual({ ok: true, reason: "m".repeat(120) });
    expect(validateReason("🥚".repeat(120), true).ok).toBe(true);
    expect(validateReason("m".repeat(121), false)).toEqual({ ok: false, error: "Usá hasta 120 caracteres" });
  });
});

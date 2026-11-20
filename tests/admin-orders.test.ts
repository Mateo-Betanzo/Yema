import {
  formatElapsed,
  groupAdminOrders,
  isAppOrder,
  orderActions,
  orderFlag,
  shortClientName,
  statusLabel,
  type AdminOrderBase,
} from "@/logic/admin-orders";

// Spec 005 · T4: the sections of the admin Home and what each order says (RF-1, RF-2, RF-7, RF-8,
// RF-24, RF-25). "Now" is Friday 13 November 2026 at 12:00 in Buenos Aires (15:00 UTC).
const NOW = new Date("2026-11-13T15:00:00Z");

let nextId = 1;
const order = (fields: Partial<AdminOrderBase>): AdminOrderBase => ({
  id: nextId++,
  status: "pending",
  delivery_date: "2026-11-13",
  slot_starts_at: "18:00:00",
  slot_ends_at: "21:00:00",
  created_at: "2026-11-13T12:00:00Z",
  ...fields,
});

describe("groupAdminOrders", () => {
  test("RF-1: Nuevos are the pending orders of any day, by day, slot and creation", () => {
    const later = order({ delivery_date: "2026-11-16", slot_starts_at: "09:00:00" });
    const sameSlotNewer = order({ created_at: "2026-11-13T13:00:00Z" });
    const sameSlotOlder = order({ created_at: "2026-11-13T11:00:00Z" });
    const morning = order({ slot_starts_at: "09:00:00", slot_ends_at: "11:00:00" });
    const past = order({ delivery_date: "2026-11-10" });
    const { fresh } = groupAdminOrders([later, sameSlotNewer, sameSlotOlder, morning, past], NOW);
    expect(fresh.map((o) => o.id)).toEqual([past.id, morning.id, sameSlotOlder.id, sameSlotNewer.id, later.id]);
  });

  test("RF-2, RF-25: Para hoy has the late orders first, then today's by slot, only accepted and on the way", () => {
    const evening = order({ status: "accepted" });
    const morning = order({ status: "on_the_way", slot_starts_at: "09:00:00", slot_ends_at: "11:00:00" });
    const lateOld = order({ status: "accepted", delivery_date: "2026-11-09" });
    const lateNew = order({ status: "on_the_way", delivery_date: "2026-11-12" });
    const { today } = groupAdminOrders([evening, morning, lateNew, lateOld], NOW);
    expect(today.map((o) => o.id)).toEqual([lateOld.id, lateNew.id, morning.id, evening.id]);
  });

  test("RF-24: Próximos are the accepted and on the way orders of later days, by day and slot", () => {
    const saturday = order({ status: "accepted", delivery_date: "2026-11-14" });
    const monday = order({ status: "on_the_way", delivery_date: "2026-11-16", slot_starts_at: "09:00:00" });
    const { upcoming } = groupAdminOrders([monday, saturday], NOW);
    expect(upcoming.map((o) => o.id)).toEqual([saturday.id, monday.id]);
  });

  test("finished orders are in no section", () => {
    const groups = groupAdminOrders(
      [order({ status: "delivered" }), order({ status: "rejected" }), order({ status: "cancelled" })],
      NOW,
    );
    expect(groups).toEqual({ fresh: [], today: [], upcoming: [] });
  });

  test("the day changes at midnight in Buenos Aires (03:00 UTC), not in UTC", () => {
    const friday = order({ status: "accepted", delivery_date: "2026-11-13" });
    expect(groupAdminOrders([friday], new Date("2026-11-14T02:59:00Z")).today).toEqual([friday]);
    const afterMidnight = groupAdminOrders([friday], new Date("2026-11-14T03:00:00Z"));
    expect(afterMidnight.today).toEqual([friday]);
    expect(orderFlag(friday, new Date("2026-11-14T03:00:00Z"))).toEqual({ kind: "late", label: "Atrasado" });
  });

  test("does not change the list it receives", () => {
    const orders = [order({ delivery_date: "2026-11-16" }), order({ delivery_date: "2026-11-14" })];
    const ids = orders.map((o) => o.id);
    groupAdminOrders(orders, NOW);
    expect(orders.map((o) => o.id)).toEqual(ids);
  });
});

// Cambio del 2026-11-19: the mark is short ("Atrasado", "Vencido"); the day is in the detail (RF-7).
describe("orderFlag (RF-25)", () => {
  test("an accepted or on the way order of a past day is late", () => {
    expect(orderFlag(order({ status: "accepted", delivery_date: "2026-11-09" }), NOW)).toEqual({
      kind: "late",
      label: "Atrasado",
    });
  });

  test("a pending order whose slot already ended is expired", () => {
    const morning = order({ slot_starts_at: "09:00:00", slot_ends_at: "11:00:00" });
    expect(orderFlag(morning, NOW)).toEqual({ kind: "expired", label: "Vencido" });
  });

  test("it expires exactly when the slot ends (11:00 in Buenos Aires = 14:00 UTC)", () => {
    const morning = order({ slot_starts_at: "09:00:00", slot_ends_at: "11:00:00" });
    expect(orderFlag(morning, new Date("2026-11-13T13:59:59Z"))).toBeNull();
    expect(orderFlag(morning, new Date("2026-11-13T14:00:00Z"))?.kind).toBe("expired");
  });

  test("today's orders, later pending ones and finished ones have no flag", () => {
    expect(orderFlag(order({ status: "accepted" }), NOW)).toBeNull();
    expect(orderFlag(order({}), NOW)).toBeNull();
    expect(orderFlag(order({ status: "delivered", delivery_date: "2026-11-09" }), NOW)).toBeNull();
  });
});

describe("formatElapsed (RF-7)", () => {
  test.each([
    ["2026-11-13T14:59:30Z", "Hace un momento"],
    ["2026-11-13T14:59:00Z", "Hace 1 min"],
    ["2026-11-13T14:55:00Z", "Hace 5 min"],
    ["2026-11-13T14:00:01Z", "Hace 59 min"],
    ["2026-11-13T14:00:00Z", "Hace 1 h"],
    ["2026-11-13T13:00:00Z", "Hace 2 h"],
    ["2026-11-12T15:00:00Z", "Hace 1 día"],
    ["2026-11-10T15:00:00Z", "Hace 3 días"],
    ["2026-11-13T15:05:00Z", "Hace un momento"],
  ])("%s → %j", (createdAt, text) => {
    expect(formatElapsed(createdAt, NOW)).toBe(text);
  });
});

describe("statusLabel", () => {
  test.each([
    ["pending", "Nuevo"],
    ["accepted", "Aceptado"],
    ["on_the_way", "En camino"],
    ["delivered", "Entregado"],
    ["rejected", "Rechazado"],
    ["cancelled", "Cancelado"],
  ] as const)("%s → %s", (status, label) => {
    expect(statusLabel(status)).toBe(label);
  });
});

describe("orderActions (RF-8)", () => {
  test("pending: Rechazar (reason optional) and Aceptar pedido", () => {
    expect(orderActions("pending")).toEqual([
      { status: "rejected", label: "Rechazar", reason: "optional", primary: false },
      { status: "accepted", label: "Aceptar pedido", reason: "none", primary: true },
    ]);
  });

  test("accepted: Cancelar (reason required) and En camino", () => {
    expect(orderActions("accepted")).toEqual([
      { status: "cancelled", label: "Cancelar", reason: "required", primary: false },
      { status: "on_the_way", label: "En camino", reason: "none", primary: true },
    ]);
  });

  test("on the way: Cancelar (reason required) and Entregado", () => {
    expect(orderActions("on_the_way")).toEqual([
      { status: "cancelled", label: "Cancelar", reason: "required", primary: false },
      { status: "delivered", label: "Entregado", reason: "none", primary: true },
    ]);
  });

  test.each(["delivered", "rejected", "cancelled"] as const)("%s: no actions", (status) => {
    expect(orderActions(status)).toEqual([]);
  });
});

// Spec 008 · T1: a counter sale is an order without day, slot nor address; the admin Home lists only
// orders of the app, which always have them.
describe("isAppOrder (spec 008)", () => {
  const app = { delivery_date: "2026-11-17", slot_starts_at: "09:00:00", slot_ends_at: "11:00:00", address: "Calle 1" };
  const sale = { delivery_date: null, slot_starts_at: null, slot_ends_at: null, address: null };

  test("an order of the app has its day, slot and address", () => {
    expect(isAppOrder(app)).toBe(true);
  });

  test("a counter sale has none of them", () => {
    expect(isAppOrder(sale)).toBe(false);
    expect(isAppOrder({ ...app, address: null })).toBe(false);
  });
});

// Spec 005, cambio del 2026-11-19 · T11: the name of the one-line row (RF-3), "Rocío F.".
describe("shortClientName (RF-3)", () => {
  const client = (first: string | null, last: string | null) => ({ client_first_name: first, client_last_name: last });

  test("the first name and the initial of the last name", () => {
    expect(shortClientName(client("Rocío", "Fernández"))).toBe("Rocío F.");
  });

  test("the initial keeps its accent and is upper case; a compound last name takes its first letter", () => {
    expect(shortClientName(client("Ana", "Álvarez"))).toBe("Ana Á.");
    expect(shortClientName(client("Juan", "de la Fuente"))).toBe("Juan D.");
  });

  test("a compound first name stays whole", () => {
    expect(shortClientName(client("María José", "Pérez"))).toBe("María José P.");
  });

  test("without last name, the first name; without first name, the last name whole", () => {
    expect(shortClientName(client("Rocío", null))).toBe("Rocío");
    expect(shortClientName(client("Rocío", "  "))).toBe("Rocío");
    expect(shortClientName(client(null, "Fernández"))).toBe("Fernández");
  });

  test("without a profile it reads, as the full name, Cliente", () => {
    expect(shortClientName(client(null, null))).toBe("Cliente");
  });
});

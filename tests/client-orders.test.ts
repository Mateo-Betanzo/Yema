import {
  cardCopy,
  finishedAt,
  formatStepTime,
  historySections,
  homeCard,
  mostBought,
  orderSummary,
  reasonText,
  timelineLabel,
  timelineStep,
  timelineSteps,
  type ClientOrderBase,
  type ClientOrderItem,
} from "@/logic/client-orders";

// Spec 006 · T3: what the Home and the order detail of the client show (RF-2, RF-3, RF-10 to RF-13,
// RF-18, RF-19, RF-23 to RF-25). "Now" is Friday 13 November 2026 at 12:00 in Buenos Aires (15:00 UTC).
const NOW = new Date("2026-11-13T15:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;

const item = (fields: Partial<ClientOrderItem> = {}): ClientOrderItem => ({
  product_id: 1,
  name: "Maple Grandes",
  egg_type_name: "Grandes",
  format_name: "Maple",
  quantity: 2,
  unit_price: 5000,
  ...fields,
});

let nextId = 1;
const order = (fields: Partial<ClientOrderBase> = {}): ClientOrderBase => ({
  id: nextId++,
  status: "pending",
  status_reason: null,
  cancelled_by: null,
  created_at: "2026-11-13T12:00:00Z",
  accepted_at: null,
  on_the_way_at: null,
  delivered_at: null,
  rejected_at: null,
  cancelled_at: null,
  items: [item()],
  ...fields,
});

/** A finished order that ended `ago` milliseconds before NOW. */
const delivered = (ago: number, fields: Partial<ClientOrderBase> = {}) =>
  order({
    status: "delivered",
    accepted_at: "2026-11-10T12:10:00Z",
    on_the_way_at: "2026-11-10T13:00:00Z",
    delivered_at: new Date(NOW.getTime() - ago).toISOString(),
    ...fields,
  });
const rejected = (ago: number, fields: Partial<ClientOrderBase> = {}) =>
  order({ status: "rejected", rejected_at: new Date(NOW.getTime() - ago).toISOString(), ...fields });
const cancelled = (ago: number, by: "client" | "admin", fields: Partial<ClientOrderBase> = {}) =>
  order({
    status: "cancelled",
    cancelled_by: by,
    status_reason: by === "admin" ? "No estaba nadie" : null,
    cancelled_at: new Date(NOW.getTime() - ago).toISOString(),
    ...fields,
  });

const NONE = new Set<number>();

describe("finishedAt", () => {
  test("the moment an order was delivered, rejected or cancelled", () => {
    const at = "2026-11-12T10:00:00Z";
    expect(finishedAt(order({ status: "delivered", delivered_at: at }))).toBe(at);
    expect(finishedAt(order({ status: "rejected", rejected_at: "2026-11-11T10:00:00Z" }))).toBe("2026-11-11T10:00:00Z");
    expect(finishedAt(order({ status: "cancelled", cancelled_at: "2026-11-10T10:00:00Z" }))).toBe(
      "2026-11-10T10:00:00Z",
    );
  });

  test("an active order has not finished, even if it was accepted", () => {
    expect(finishedAt(order({ status: "accepted", accepted_at: "2026-11-13T12:10:00Z" }))).toBeNull();
  });
});

describe("homeCard", () => {
  test("RF-2: the active order, before any finished one", () => {
    const active = order({ status: "on_the_way" });
    expect(homeCard([delivered(DAY_MS), active], NOW, NONE)).toEqual({ kind: "active", order: active });
  });

  test("RF-10: without an active order, the finished order that ended last", () => {
    const older = delivered(3 * DAY_MS);
    const newer = rejected(DAY_MS);
    expect(homeCard([older, newer], NOW, NONE)).toEqual({ kind: "finished", order: newer });
  });

  test("RF-10: only if it ended less than 7 days ago", () => {
    const justInside = delivered(7 * DAY_MS - 1);
    const justOutside = delivered(7 * DAY_MS);
    expect(homeCard([justInside], NOW, NONE)).toEqual({ kind: "finished", order: justInside });
    expect(homeCard([justOutside], NOW, NONE)).toEqual({ kind: "empty" });
  });

  test("RF-10: an order the client cancelled is not shown; the one before it is", () => {
    const before = cancelled(2 * DAY_MS, "admin");
    expect(homeCard([cancelled(DAY_MS, "client"), before], NOW, NONE)).toEqual({ kind: "finished", order: before });
    expect(homeCard([cancelled(DAY_MS, "client")], NOW, NONE)).toEqual({ kind: "empty" });
  });

  test("RF-11: a hidden order leaves the card empty; an older one does not take its place", () => {
    const newer = delivered(DAY_MS);
    expect(homeCard([delivered(2 * DAY_MS), newer], NOW, new Set([newer.id]))).toEqual({ kind: "empty" });
  });

  test("RF-12: no orders at all", () => {
    expect(homeCard([], NOW, NONE)).toEqual({ kind: "empty" });
  });
});

describe("cardCopy", () => {
  test("RF-2: the title and text of each active status, never with a date", () => {
    expect(cardCopy(order({ status: "pending" }))).toEqual({
      title: "Pedido recibido",
      text: "Esperando que lo acepten",
    });
    expect(cardCopy(order({ status: "accepted" }))).toEqual({
      title: "Pedido aceptado",
      text: "Ya lo estamos preparando",
    });
    expect(cardCopy(order({ status: "on_the_way" }))).toEqual({
      title: "Pedido en camino",
      text: "El repartidor está en camino hacia tu dirección",
    });
  });

  test("RF-10, RF-24: a finished order, with its reason when it has one", () => {
    expect(cardCopy(delivered(DAY_MS))).toEqual({ title: "Pedido entregado", text: "¡Gracias por tu compra!" });
    expect(cardCopy(rejected(DAY_MS, { status_reason: "Fuera de zona" }))).toEqual({
      title: "Pedido rechazado",
      text: "Motivo: Fuera de zona",
    });
    expect(cardCopy(rejected(DAY_MS))).toEqual({ title: "Pedido rechazado", text: null });
    expect(cardCopy(cancelled(DAY_MS, "admin"))).toEqual({
      title: "Pedido cancelado",
      text: "Motivo: No estaba nadie",
    });
  });
});

describe("reasonText", () => {
  test("RF-24: the reason of the admin", () => {
    expect(reasonText(rejected(DAY_MS, { status_reason: "Fuera de zona" }))).toBe("Motivo: Fuera de zona");
    expect(reasonText(cancelled(DAY_MS, "admin"))).toBe("Motivo: No estaba nadie");
  });

  test("RF-24: a rejection without a reason shows only its status", () => {
    expect(reasonText(rejected(DAY_MS))).toBeNull();
  });

  test("RF-25: the client cancelled it", () => {
    expect(reasonText(cancelled(DAY_MS, "client"))).toBe("Cancelaste este pedido");
  });

  test("other statuses have no reason", () => {
    expect(reasonText(order())).toBeNull();
    expect(reasonText(delivered(DAY_MS))).toBeNull();
  });
});

describe("timeline", () => {
  test("RF-3: the step of each status of an order on its way", () => {
    expect(timelineStep("pending")).toBe(1);
    expect(timelineStep("accepted")).toBe(2);
    expect(timelineStep("on_the_way")).toBe(3);
    expect(timelineStep("delivered")).toBe(4);
    expect(timelineStep("rejected")).toBeNull();
    expect(timelineStep("cancelled")).toBeNull();
  });

  test("RF-3: the text for screen readers", () => {
    expect(timelineLabel("pending")).toBe("Paso 1 de 4: Recibido");
    expect(timelineLabel("on_the_way")).toBe("Paso 3 de 4: En camino");
    expect(timelineLabel("delivered")).toBe("Paso 4 de 4: Entregado");
    expect(timelineLabel("rejected")).toBeNull();
  });

  test("RF-23: the four steps, with the date of the ones reached", () => {
    const accepted = order({ status: "accepted", accepted_at: "2026-11-13T12:10:00Z" });
    expect(timelineSteps(accepted)).toEqual([
      { label: "Recibido", at: "2026-11-13T12:00:00Z" },
      { label: "Aceptado", at: "2026-11-13T12:10:00Z" },
      { label: "En camino", at: null },
      { label: "Entregado", at: null },
    ]);
  });

  test("RF-23: a rejected order ends in Rechazado instead of the missing steps", () => {
    const order_ = rejected(DAY_MS);
    expect(timelineSteps(order_)).toEqual([
      { label: "Recibido", at: order_.created_at },
      { label: "Rechazado", at: order_.rejected_at },
    ]);
  });

  test("RF-23: an order cancelled on its way keeps the steps it reached", () => {
    const order_ = cancelled(DAY_MS, "admin", {
      accepted_at: "2026-11-12T12:10:00Z",
      on_the_way_at: "2026-11-12T13:00:00Z",
    });
    expect(timelineSteps(order_)).toEqual([
      { label: "Recibido", at: order_.created_at },
      { label: "Aceptado", at: "2026-11-12T12:10:00Z" },
      { label: "En camino", at: "2026-11-12T13:00:00Z" },
      { label: "Cancelado", at: order_.cancelled_at },
    ]);
  });

  test("RF-23: the date and time of a step, in Buenos Aires", () => {
    expect(formatStepTime("2026-11-13T13:32:00Z")).toBe("vie 13 nov 10:32");
    // 01:00 UTC on Saturday is still Friday in Buenos Aires.
    expect(formatStepTime("2026-11-14T01:05:00Z")).toBe("vie 13 nov 22:05");
  });
});

describe("historySections", () => {
  test("RF-18: the finished orders by the day they ended, the newest first, without the active one", () => {
    const today = delivered(2 * 60 * 60 * 1000); // 10:00 today
    const todayEarlier = rejected(5 * 60 * 60 * 1000); // 07:00 today
    const yesterday = cancelled(DAY_MS, "client");
    const older = delivered(3 * DAY_MS);
    const sections = historySections([order({ status: "pending" }), older, todayEarlier, yesterday, today], NOW);
    expect(sections.map((section) => section.title)).toEqual(["Hoy · vie 13 nov", "Ayer · jue 12 nov", "mar 10 nov"]);
    expect(sections.map((section) => section.orders.map((o) => o.id))).toEqual([
      [today.id, todayEarlier.id],
      [yesterday.id],
      [older.id],
    ]);
  });

  test("RF-18: the day changes at midnight in Buenos Aires (03:00 UTC)", () => {
    const lateFriday = order({ status: "delivered", delivered_at: "2026-11-14T02:59:00Z" });
    const earlySaturday = order({ status: "delivered", delivered_at: "2026-11-14T03:00:00Z" });
    const saturdayMorning = new Date("2026-11-14T12:00:00Z");
    expect(historySections([lateFriday, earlySaturday], saturdayMorning).map((section) => section.title)).toEqual([
      "Hoy · sáb 14 nov",
      "Ayer · vie 13 nov",
    ]);
  });

  test("RF-20: no finished orders, no sections", () => {
    expect(historySections([order()], NOW)).toEqual([]);
  });
});

describe("orderSummary", () => {
  test("RF-19: the first line with its quantity", () => {
    expect(orderSummary([item({ quantity: 2, name: "Maple Grandes" })])).toBe("2 × Maple Grandes");
  });

  test("RF-19: and how many more lines", () => {
    expect(orderSummary([item(), item({ product_id: 2 })])).toBe("2 × Maple Grandes y 1 más");
    expect(orderSummary([item(), item({ product_id: 2 }), item({ product_id: 3 })])).toBe(
      "2 × Maple Grandes y 2 más",
    );
  });
});

describe("history of the admin (spec 007, RF-14, RF-15)", () => {
  // A row of admin_order_overview: no cancelled_by needed, and lines without product ids or types.
  const adminOrder = { id: 900, status: "delivered" as const, delivered_at: "2026-11-13T13:00:00Z", rejected_at: null, cancelled_at: null };

  test("historySections only needs the status and the moments of an order", () => {
    expect(historySections([adminOrder], NOW)).toEqual([{ title: "Hoy · vie 13 nov", orders: [adminOrder] }]);
  });

  test("orderSummary only needs the name and quantity of a line, and a line without a name reads as a product", () => {
    expect(orderSummary([{ name: "Pack Grandes", quantity: 1 }, { name: null, quantity: 2 }])).toBe("1 × Pack Grandes y 1 más");
    expect(orderSummary([{ name: null, quantity: 2 }])).toBe("2 × Producto");
  });
});

// /feature 2026-11-18: the product on top of the Shop, "Tu más comprado".
describe("mostBought", () => {
  type Product = { id: number; name: string };
  const products = (...ids: number[]): Product[] => ids.map((id) => ({ id, name: `Producto ${id}` }));

  test("the product with the most units across the delivered orders, as it is in the Shop", () => {
    const orders = [
      delivered(3 * DAY_MS, { items: [item({ product_id: 1, quantity: 2 }), item({ product_id: 2, quantity: 1 })] }),
      delivered(DAY_MS, { items: [item({ product_id: 2, quantity: 3 })] }),
    ];
    expect(mostBought(orders, products(1, 2, 3))).toEqual({ id: 2, name: "Producto 2" });
  });

  test("only delivered orders count", () => {
    const orders = [
      delivered(3 * DAY_MS, { items: [item({ product_id: 1, quantity: 1 })] }),
      order({ status: "pending", items: [item({ product_id: 2, quantity: 5 })] }),
      rejected(DAY_MS, { items: [item({ product_id: 3, quantity: 5 })] }),
      cancelled(DAY_MS, "client", { items: [item({ product_id: 4, quantity: 5 })] }),
    ];
    expect(mostBought(orders, products(1, 2, 3, 4))?.id).toBe(1);
  });

  test("a tie goes to the product of the latest delivery", () => {
    const orders = [
      delivered(3 * DAY_MS, { items: [item({ product_id: 1, quantity: 2 })] }),
      delivered(DAY_MS, { items: [item({ product_id: 2, quantity: 2 })] }),
    ];
    expect(mostBought(orders, products(1, 2))?.id).toBe(2);
  });

  test("a product no longer in the Shop is left out", () => {
    const orders = [
      delivered(DAY_MS, { items: [item({ product_id: 1, quantity: 9 }), item({ product_id: 2, quantity: 1 })] }),
    ];
    expect(mostBought(orders, products(2))?.id).toBe(2);
  });

  test("nothing delivered, or nothing still in the Shop: no product", () => {
    expect(mostBought([], products(1))).toBeNull();
    expect(mostBought([order(), rejected(DAY_MS)], products(1))).toBeNull();
    expect(mostBought([delivered(DAY_MS, { items: [item({ product_id: 7 })] })], products(1))).toBeNull();
  });
});

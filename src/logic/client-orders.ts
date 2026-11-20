// What the Home, the history and the order detail of the client show (spec 006: RF-2, RF-3, RF-10,
// RF-11, RF-18, RF-19, RF-23 to RF-25; "Volver a comprar" left with spec 010). The orders come from
// client_orders() and the products from shop_products():
// prices, availability, totals and statuses are decided in the base. Here they are only chosen, ordered
// and written; what depends on the moment receives "now". Nothing here reads the clock.
import type { OrderStatus } from "./admin-orders";
import { formatDateKey, formatTime, groupByBuenosAiresDay, toBuenosAiresDate } from "./dates";

export type ClientOrderItem = {
  product_id: number;
  /** Current names (RF-22); the price is the one saved with the order. */
  name: string;
  egg_type_name: string;
  format_name: string;
  quantity: number;
  unit_price: number;
};

/**
 * What the history needs of an order: its status and when it ended. A row of client_orders() and one of
 * admin_order_overview (spec 007) both have it.
 */
export type OrderMoments = {
  id: number;
  status: OrderStatus;
  delivered_at: string | null;
  rejected_at: string | null;
  cancelled_at: string | null;
};

/** What these functions need of an order (a subset of a row of client_orders()). */
export type ClientOrderBase = OrderMoments & {
  status_reason: string | null;
  cancelled_by: "client" | "admin" | null;
  created_at: string;
  accepted_at: string | null;
  on_the_way_at: string | null;
  items: readonly ClientOrderItem[];
};

/** What the summary needs of a line; the admin's lines may come without a name (spec 005). */
export type SummaryLine = { name: string | null; quantity: number };

const ACTIVE: readonly OrderStatus[] = ["pending", "accepted", "on_the_way"];
/** RF-10: a finished order stays on the card for less than 7 days. */
const CARD_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/** The moment the order was delivered, rejected or cancelled; null while it is active. */
export function finishedAt(order: OrderMoments): string | null {
  if (ACTIVE.includes(order.status)) return null;
  return order.delivered_at ?? order.rejected_at ?? order.cancelled_at;
}

// The finished orders, the one that ended last first (the id breaks ties).
function finishedNewestFirst<T extends OrderMoments>(orders: readonly T[]): { order: T; at: string }[] {
  return orders
    .flatMap((order) => {
      const at = finishedAt(order);
      return at ? [{ order, at }] : [];
    })
    .sort((a, b) => b.at.localeCompare(a.at) || b.order.id - a.order.id);
}

export type HomeCard<T> = { kind: "active"; order: T } | { kind: "finished"; order: T } | { kind: "empty" };

/**
 * RF-2, RF-10 to RF-12: the active order; without one, the finished order that ended last, if it
 * ended less than 7 days ago, the client did not cancel it and did not hide it. Hiding it does not
 * bring an older one back.
 */
export function homeCard<T extends ClientOrderBase>(
  orders: readonly T[],
  now: Date,
  hidden: ReadonlySet<number>,
): HomeCard<T> {
  const active = orders.find((order) => ACTIVE.includes(order.status));
  if (active) return { kind: "active", order: active };
  const last = finishedNewestFirst(orders.filter((order) => order.cancelled_by !== "client"))[0];
  if (!last || hidden.has(last.order.id)) return { kind: "empty" };
  if (now.getTime() - new Date(last.at).getTime() >= CARD_DAYS_MS) return { kind: "empty" };
  return { kind: "finished", order: last.order };
}

/** RF-24, RF-25: why a rejected or cancelled order ended, or null. */
export function reasonText(order: ClientOrderBase): string | null {
  if (order.status === "cancelled" && order.cancelled_by === "client") return "Cancelaste este pedido";
  if ((order.status === "rejected" || order.status === "cancelled") && order.status_reason) {
    return `Motivo: ${order.status_reason}`;
  }
  return null;
}

const CARD_TITLES: Record<OrderStatus, string> = {
  pending: "Pedido recibido",
  accepted: "Pedido aceptado",
  on_the_way: "Pedido en camino",
  delivered: "Pedido entregado",
  rejected: "Pedido rechazado",
  cancelled: "Pedido cancelado",
};

const CARD_TEXTS: Partial<Record<OrderStatus, string>> = {
  pending: "Esperando que lo acepten",
  accepted: "Ya lo estamos preparando",
  on_the_way: "El repartidor está en camino hacia tu dirección",
  delivered: "¡Gracias por tu compra!",
};

/** RF-2, RF-10: the title and the text of the card; the texts never carry a date. */
export function cardCopy(order: ClientOrderBase): { title: string; text: string | null } {
  return { title: CARD_TITLES[order.status], text: CARD_TEXTS[order.status] ?? reasonText(order) };
}

const STEPS = ["Recibido", "Aceptado", "En camino", "Entregado"] as const;
const STEP_OF: Partial<Record<OrderStatus, number>> = { pending: 1, accepted: 2, on_the_way: 3, delivered: 4 };

/** RF-3: the step (1 to 4) of an order on its way; null once rejected or cancelled. */
export function timelineStep(status: OrderStatus): number | null {
  return STEP_OF[status] ?? null;
}

/** RF-3: "Paso 3 de 4: En camino", for screen readers. */
export function timelineLabel(status: OrderStatus): string | null {
  const step = timelineStep(status);
  return step === null ? null : `Paso ${step} de ${STEPS.length}: ${STEPS[step - 1]}`;
}

export type TimelineEntry = { label: string; at: string | null };

/**
 * RF-23: each step with the moment it was reached (null if not yet). A rejected or cancelled order
 * keeps the steps it reached and ends in "Rechazado" or "Cancelado" instead of the missing ones.
 */
export function timelineSteps(order: ClientOrderBase): TimelineEntry[] {
  const steps: TimelineEntry[] = [
    { label: STEPS[0], at: order.created_at },
    { label: STEPS[1], at: order.accepted_at },
    { label: STEPS[2], at: order.on_the_way_at },
    { label: STEPS[3], at: order.delivered_at },
  ];
  const reached = steps.filter((step) => step.at);
  if (order.status === "rejected") return [...reached, { label: "Rechazado", at: order.rejected_at }];
  if (order.status === "cancelled") return [...reached, { label: "Cancelado", at: order.cancelled_at }];
  return steps;
}

/** RF-23: "vie 13 nov 10:32", in Buenos Aires. */
export function formatStepTime(at: string): string {
  const instant = new Date(at);
  return `${formatDateKey(toBuenosAiresDate(instant))} ${formatTime(instant)}`;
}

export type HistorySection<T> = { title: string; orders: T[] };

/**
 * RF-18: the finished orders by the Buenos Aires day they ended, the newest first: "Hoy · vie 13 nov",
 * "Ayer · jue 12 nov" or "mar 10 nov".
 */
export function historySections<T extends OrderMoments>(orders: readonly T[], now: Date): HistorySection<T>[] {
  return groupByBuenosAiresDay(finishedNewestFirst(orders), ({ at }) => at, now).map(({ title, items }) => ({
    title,
    orders: items.map(({ order }) => order),
  }));
}

/**
 * "Tu más comprado", on top of the Shop (/feature 2026-11-18): the product with the most units across
 * the delivered orders of the client; a tie goes to the latest delivery. Only a product still in the
 * Shop (shop_products() lists only visible ones), as the Shop has it, with its current price and units.
 */
export function mostBought<P extends { id: number }>(orders: readonly ClientOrderBase[], products: readonly P[]): P | null {
  const visible = new Map(products.map((product) => [product.id, product]));
  const units = new Map<number, number>();
  // Newest first, so the first product to reach the most units is the one of the latest delivery.
  for (const { order } of finishedNewestFirst(orders.filter((candidate) => candidate.status === "delivered"))) {
    for (const line of order.items) {
      if (visible.has(line.product_id)) units.set(line.product_id, (units.get(line.product_id) ?? 0) + line.quantity);
    }
  }
  let best: number | null = null;
  for (const [id, count] of units) if (best === null || count > (units.get(best) ?? 0)) best = id;
  return best === null ? null : (visible.get(best) ?? null);
}

/** RF-19: "2 × Maple Grandes", plus "y N más" when the order has more lines. */
export function orderSummary(items: readonly SummaryLine[]): string {
  const [first, ...rest] = items;
  if (!first) return "";
  const text = `${first.quantity} × ${first.name ?? "Producto"}`;
  return rest.length > 0 ? `${text} y ${rest.length} más` : text;
}

// The orders of the admin Home and what each one says (spec 005: RF-1, RF-2, RF-7, RF-8, RF-24, RF-25).
// Which orders are active comes from the base; "today", late and expired depend on the moment of the
// reading, so they are computed here with "now" as a parameter. Nothing here reads the clock.
import { buenosAiresInstant, toBuenosAiresDate } from "./dates";

export type OrderStatus = "pending" | "accepted" | "on_the_way" | "delivered" | "rejected" | "cancelled";

/** What these functions need of an order (a subset of a row of admin_order_overview). */
export type AdminOrderBase = {
  id: number;
  status: OrderStatus;
  /** "2026-11-13" */
  delivery_date: string;
  /** "09:00:00" */
  slot_starts_at: string;
  slot_ends_at: string;
  created_at: string;
};

const ON_ITS_WAY: readonly OrderStatus[] = ["accepted", "on_the_way"];

/** The delivery of an order of the app; a counter sale (spec 008) has none of it. */
export type AppOrderFields = { delivery_date: string; slot_starts_at: string; slot_ends_at: string; address: string };

type MaybeDelivery = {
  delivery_date: string | null;
  slot_starts_at: string | null;
  slot_ends_at: string | null;
  address: string | null;
};

/** Spec 008: an order of the app has its day, slot and address; a counter sale has none of them. */
export function isAppOrder<T extends MaybeDelivery>(order: T): order is T & AppOrderFields {
  return order.delivery_date !== null && order.slot_starts_at !== null && order.slot_ends_at !== null && order.address !== null;
}

// By day, slot and creation: in "Para hoy" this also puts the late ones (older days) first.
function byDelivery(a: AdminOrderBase, b: AdminOrderBase): number {
  return (
    a.delivery_date.localeCompare(b.delivery_date) ||
    a.slot_starts_at.localeCompare(b.slot_starts_at) ||
    a.created_at.localeCompare(b.created_at)
  );
}

/** RF-1, RF-2, RF-24: Nuevos (pending of any day), Para hoy (today or late) and Próximos (later days). */
export function groupAdminOrders<T extends AdminOrderBase>(
  orders: readonly T[],
  now: Date,
): { fresh: T[]; today: T[]; upcoming: T[] } {
  const todayKey = toBuenosAiresDate(now);
  const sorted = [...orders].sort(byDelivery);
  return {
    fresh: sorted.filter((order) => order.status === "pending"),
    today: sorted.filter((order) => ON_ITS_WAY.includes(order.status) && order.delivery_date <= todayKey),
    upcoming: sorted.filter((order) => ON_ITS_WAY.includes(order.status) && order.delivery_date > todayKey),
  };
}

export type OrderFlag = { kind: "late" | "expired"; label: string };

/**
 * RF-25: "Atrasado" (accepted or on the way of a past day) or "Vencido" (pending, slot over). Short since
 * the cambio del 2026-11-19, for the one-line row; the day is in the detail (RF-7).
 */
export function orderFlag(order: AdminOrderBase, now: Date): OrderFlag | null {
  if (ON_ITS_WAY.includes(order.status) && order.delivery_date < toBuenosAiresDate(now)) {
    return { kind: "late", label: "Atrasado" };
  }
  if (order.status === "pending" && buenosAiresInstant(order.delivery_date, order.slot_ends_at) <= now) {
    return { kind: "expired", label: "Vencido" };
  }
  return null;
}

/**
 * RF-3 (cambio del 2026-11-19): the name of the one-line row, "Rocío F.": the first name and the initial
 * of the last name; with only one of them, that one whole; without a profile, "Cliente".
 */
export function shortClientName(order: { client_first_name: string | null; client_last_name: string | null }): string {
  const first = order.client_first_name?.trim() ?? "";
  const last = order.client_last_name?.trim() ?? "";
  if (!first) return last || "Cliente";
  if (!last) return first;
  return `${first} ${Array.from(last)[0].toUpperCase()}.`;
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** RF-7: "Hace un momento", "Hace 5 min", "Hace 2 h", "Hace 3 días". */
export function formatElapsed(createdAt: string, now: Date): string {
  const elapsed = now.getTime() - new Date(createdAt).getTime();
  if (elapsed < MINUTE) return "Hace un momento";
  if (elapsed < HOUR) return `Hace ${Math.floor(elapsed / MINUTE)} min`;
  if (elapsed < DAY) return `Hace ${Math.floor(elapsed / HOUR)} h`;
  const days = Math.floor(elapsed / DAY);
  return `Hace ${days} ${days === 1 ? "día" : "días"}`;
}

const LABELS: Record<OrderStatus, string> = {
  pending: "Nuevo",
  accepted: "Aceptado",
  on_the_way: "En camino",
  delivered: "Entregado",
  rejected: "Rechazado",
  cancelled: "Cancelado",
};

export function statusLabel(status: OrderStatus): string {
  return LABELS[status];
}

export type OrderAction = {
  /** The status set_order_status receives. */
  status: OrderStatus;
  label: string;
  /** RF-16: a rejection may have a reason; a cancellation must. */
  reason: "none" | "optional" | "required";
  /** The main button (filled), as "Aceptar pedido" in the Figma; the other is outlined. */
  primary: boolean;
};

const REJECT: OrderAction = { status: "rejected", label: "Rechazar", reason: "optional", primary: false };
const CANCEL: OrderAction = { status: "cancelled", label: "Cancelar", reason: "required", primary: false };

const ACTIONS: Record<OrderStatus, OrderAction[]> = {
  pending: [REJECT, { status: "accepted", label: "Aceptar pedido", reason: "none", primary: true }],
  accepted: [CANCEL, { status: "on_the_way", label: "En camino", reason: "none", primary: true }],
  on_the_way: [CANCEL, { status: "delivered", label: "Entregado", reason: "none", primary: true }],
  delivered: [],
  rejected: [],
  cancelled: [],
};

/** RF-8: the actions of a status, the secondary one first. */
export function orderActions(status: OrderStatus): OrderAction[] {
  return ACTIONS[status];
}

// Turns an error of create_order into what the checkout does and what the client reads (spec 004:
// RF-25 to RF-28, RF-32). The base names the product in the hint of product_unavailable and
// not_enough_units; two confirmations of the same client that race hit the unique index of active orders.
import { isPostgresError } from "./catalog-errors";
import { NO_CONNECTION } from "./form-rules";

/** What went wrong, so the checkout knows what to refresh (RF-25, RF-26, RF-28). */
export type OrderErrorKind = "active_order" | "slot" | "product" | "units" | "price" | "network" | "other";

const KINDS: Record<string, OrderErrorKind> = {
  active_order_exists: "active_order",
  slot_unavailable: "slot",
  product_unavailable: "product",
  not_enough_units: "units",
  price_changed: "price",
};

export function orderErrorKind(error: unknown): OrderErrorKind {
  if (!isPostgresError(error)) return "other";
  if (error.code === "") return "network";
  if (error.code === "P0001") return KINDS[error.message] ?? "other";
  if (error.code === "23505" && error.message.includes('"orders_one_active_per_client"')) return "active_order";
  return "other";
}

export function orderErrorMessage(error: unknown): string {
  const product = isPostgresError(error) && error.hint ? error.hint : null;
  switch (orderErrorKind(error)) {
    case "active_order":
      return "Ya tenés un pedido en curso";
    case "slot":
      return "Esa franja ya no está disponible";
    case "product":
      return `${product ?? "Un producto"} ya no está a la venta`;
    case "units":
      return product ? `No alcanzan las unidades de ${product}` : "No alcanzan las unidades de un producto";
    case "price":
      return "Cambiaron los precios, revisá tu carrito";
    case "network":
      return NO_CONNECTION;
    default:
      return isPostgresError(error) && error.code === "42501"
        ? "No tenés permiso para hacer esto"
        : "No pudimos confirmar el pedido. Intentá de nuevo";
  }
}

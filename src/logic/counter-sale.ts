// What the counter sale of the admin says (spec 008: RF-3, RF-4, RF-6, RF-11, RF-13). The base decides
// what is available, the prices and the total (create_counter_sale); these only write what it answered.
import { isPostgresError } from "./catalog-errors";
import { formatARS } from "./currency";
import { orderErrorKind } from "./order-errors";

/** RF-3: up to 99 units of a product in one sale (the Shop allows 5). */
export const COUNTER_SALE_MAX = 99;
/** RF-6: the optional name of whoever bought. */
export const COUNTER_SALE_NAME_MAX = 60;

/** RF-11: why a sale was not registered, with the product the base names when it can. */
export function counterSaleErrorMessage(error: unknown): string {
  const product = isPostgresError(error) && error.hint ? error.hint : null;
  switch (orderErrorKind(error)) {
    case "product":
      return `${product ?? "Un producto"} ya no está a la venta`;
    case "units":
      return product ? `No alcanzan las unidades de ${product}` : "No alcanzan las unidades de un producto";
    case "price":
      return "Cambiaron los precios, revisá la venta";
    case "network":
      return "No pudimos registrar la venta. Revisá tu conexión.";
    default:
      return "No pudimos registrar la venta";
  }
}

/** RF-13: "Venta registrada · #212 · $10.500". */
export function saleSuccessText(sale: { order_id: number; total: number }): string {
  return `Venta registrada · #${sale.order_id} · ${formatARS(sale.total)}`;
}

/** RF-15, RF-17: "Venta en el local", with the name written down when there is one. */
export function counterSaleLabel(name: string | null): string {
  return name ? `Venta en el local · ${name}` : "Venta en el local";
}

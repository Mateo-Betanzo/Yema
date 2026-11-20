// The errors of set_order_status, as the admin reads them (spec 005: RF-16, RF-17, RF-26), and the
// reason typed before a rejection or a cancellation (RF-16). The kind tells the order screen what to
// do: reload the order when it changed, keep the reason field when the reason was the problem.
import { isPostgresError } from "./catalog-errors";
import { characterCount, NO_CONNECTION, tooLong } from "./form-rules";
import { formatEggs } from "./stock";
import { statusLabel, type OrderStatus } from "./admin-orders";

export type OrderStatusErrorKind = "changed" | "stock" | "reason" | "network" | "other";

const MAX_REASON = 120;
const REASON_REQUIRED = "Escribí el motivo";

export function orderStatusErrorKind(error: unknown): OrderStatusErrorKind {
  if (!isPostgresError(error)) return "other";
  if (error.code === "") return "network";
  if (error.code !== "P0001") return "other";
  if (error.message === "order_changed") return "changed";
  if (error.message === "not_enough_stock") return "stock";
  if (error.message === "reason_required" || error.message === "reason_too_long") return "reason";
  return "other";
}

export function orderStatusErrorMessage(error: unknown): string {
  const kind = orderStatusErrorKind(error);
  const hint = isPostgresError(error) ? (error.hint ?? "") : "";
  switch (kind) {
    case "changed":
      return hint ? `Este pedido cambió: ahora está ${statusLabel(hint as OrderStatus).toLowerCase()}` : "Este pedido ya no existe";
    case "stock": {
      const [missing, type] = hint.split("|");
      const eggs = Number(missing);
      return `No hay stock para entregar este pedido: ${eggs === 1 ? "falta" : "faltan"} ${formatEggs(eggs)} de ${type}`;
    }
    case "reason":
      return isPostgresError(error) && error.message === "reason_too_long" ? tooLong(MAX_REASON) : REASON_REQUIRED;
    case "network":
      return NO_CONNECTION;
    default:
      return isPostgresError(error) && error.code === "42501"
        ? "No tenés permiso para hacer esto"
        : "No pudimos cambiar el pedido. Intentá de nuevo";
  }
}

/** RF-16: the reason trimmed (empty = none), required for a cancellation, up to 120 characters. */
export function validateReason(
  text: string,
  required: boolean,
): { ok: true; reason: string | null } | { ok: false; error: string } {
  const reason = text.trim();
  if (reason === "") return required ? { ok: false, error: REASON_REQUIRED } : { ok: true, reason: null };
  if (characterCount(reason) > MAX_REASON) return { ok: false, error: tooLong(MAX_REASON) };
  return { ok: true, reason };
}

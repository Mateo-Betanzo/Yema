// Turns an error of the base, when saving the catalog, moving stock or deleting (archiving), into the
// message the admin sees (spec 003: RF-3, RF-7, RF-10, RF-12, RF-20; RF-46 to RF-49, cambio del RF-34). Shapes as supabase-js delivers them, checked against
// local Supabase: Postgres errors carry their code and the constraint name in the message; a request
// that never reached the server has an empty code.
import { notEnoughStock } from "./catalog-validation";
import { NO_CONNECTION } from "./form-rules";
import { formatEggs } from "./stock";

export type PostgresError = { code: string; message: string; hint?: string | null };

/** The shape of an error of the base as supabase-js delivers it (also used by order-errors.ts). */
export function isPostgresError(error: unknown): error is PostgresError {
  return (
    typeof error === "object" &&
    error !== null &&
    typeof (error as PostgresError).code === "string" &&
    typeof (error as PostgresError).message === "string"
  );
}

const LOAD_FORMAT_NOT_DELETED = "El formato de carga no se puede eliminar: se usa para cargar stock";

const CONSTRAINTS: Record<string, string> = {
  egg_types_name_key: "Ya existe un tipo con ese nombre",
  formats_name_key: "Ya existe un formato con ese nombre",
  products_type_format_key: "Ya existe un producto con ese tipo y formato",
  formats_load_format_active: "El formato de carga no se puede desactivar: se usa para cargar stock",
  formats_load_format_not_archived: LOAD_FORMAT_NOT_DELETED,
};

/** RF-46 to RF-49: why archive_product, archive_egg_type or archive_format refused; the hint has the details. */
const ARCHIVE_ERRORS: Record<string, (hint: string) => string> = {
  product_in_active_order: () => "Tiene pedidos en curso",
  has_products: (names) => `Primero eliminá sus productos: ${names}`,
  stock_left: (eggs) => `Ajustá el stock a 0 primero (${Number(eggs) === 1 ? "queda" : "quedan"} ${formatEggs(Number(eggs))})`,
  load_format: () => LOAD_FORMAT_NOT_DELETED,
};

const NOT_FOUND: Record<string, string> = {
  product_not_found: "Ese producto ya no existe",
  format_not_found: "Ese formato ya no existe",
};

export function catalogErrorMessage(error: unknown): string {
  if (isPostgresError(error)) {
    if (error.code === "") return NO_CONNECTION;
    if (error.code === "23505" || error.code === "23514") {
      const constraint = Object.keys(CONSTRAINTS).find((name) => error.message.includes(`"${name}"`));
      if (constraint) return CONSTRAINTS[constraint];
    }
    if (error.code === "P0001" && error.message === "insufficient_stock") {
      return notEnoughStock(Number(error.hint));
    }
    if (error.code === "P0001" && error.message in ARCHIVE_ERRORS) {
      return ARCHIVE_ERRORS[error.message](error.hint ?? "");
    }
    if (error.code === "P0002") return NOT_FOUND[error.message] ?? "Ese tipo ya no existe";
    if (error.code === "42501") return "No tenés permiso para hacer esto";
  }
  return "No pudimos guardar. Intentá de nuevo";
}

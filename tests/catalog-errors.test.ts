import { catalogErrorMessage } from "@/logic/catalog-errors";

// Spec 003 · T5: the errors the base returns when saving the catalog or moving stock, as the
// supabase-js client delivers them (shapes checked against local Supabase).
const pg = (code: string, message: string, hint: string | null = null) => ({ code, message, hint, details: null });

describe("catalogErrorMessage", () => {
  test.each([
    [
      "RF-3: a repeated type name",
      pg("23505", 'duplicate key value violates unique constraint "egg_types_name_key"'),
      "Ya existe un tipo con ese nombre",
    ],
    [
      "RF-7: a repeated format name",
      pg("23505", 'duplicate key value violates unique constraint "formats_name_key"'),
      "Ya existe un formato con ese nombre",
    ],
    [
      "RF-12: a repeated type and format",
      pg("23505", 'duplicate key value violates unique constraint "products_type_format_key"'),
      "Ya existe un producto con ese tipo y formato",
    ],
    [
      "RF-10: deactivating the load format",
      pg("23514", 'new row for relation "formats" violates check constraint "formats_load_format_active"'),
      "El formato de carga no se puede desactivar: se usa para cargar stock",
    ],
    ["RF-20: not enough stock", pg("P0001", "insufficient_stock", "12"), "No alcanza: hay 12 huevos"],
    ["RF-20: one egg left", pg("P0001", "insufficient_stock", "1"), "No alcanza: hay 1 huevo"],
    ["a type that no longer exists", pg("P0002", "type_not_found"), "Ese tipo ya no existe"],
    ["no permission", pg("42501", "permission denied for table egg_types"), "No tenés permiso para hacer esto"],
    // Cambio del RF-34 (2026-11-18): the errors of archive_product, archive_egg_type and archive_format.
    ["RF-47: a product in an order in course", pg("P0001", "product_in_active_order"), "Tiene pedidos en curso"],
    [
      "RF-46: a type or format with products left, named",
      pg("P0001", "has_products", "Maple Super, Pack Super"),
      "Primero eliminá sus productos: Maple Super, Pack Super",
    ],
    ["RF-48: a type with stock", pg("P0001", "stock_left", "1530"), "Ajustá el stock a 0 primero (quedan 1.530 huevos)"],
    ["RF-48: one egg left", pg("P0001", "stock_left", "1"), "Ajustá el stock a 0 primero (queda 1 huevo)"],
    [
      "RF-49: deleting the load format",
      pg("P0001", "load_format"),
      "El formato de carga no se puede eliminar: se usa para cargar stock",
    ],
    [
      "RF-49: the same, from the check of the base",
      pg("23514", 'new row for relation "formats" violates check constraint "formats_load_format_not_archived"'),
      "El formato de carga no se puede eliminar: se usa para cargar stock",
    ],
    ["a product that no longer exists", pg("P0002", "product_not_found"), "Ese producto ya no existe"],
    ["a format that no longer exists", pg("P0002", "format_not_found"), "Ese formato ya no existe"],
  ])("%s", (_case, error, message) => {
    expect(catalogErrorMessage(error)).toBe(message);
  });

  test.each([
    ["Node", "TypeError: fetch failed"],
    ["React Native", "TypeError: Network request failed"],
  ])("no connection (%s): supabase-js reports it with an empty code", (_platform, message) => {
    expect(catalogErrorMessage({ code: "", message, hint: "", details: message })).toBe(
      "No hay conexión. Revisá tu internet e intentá de nuevo",
    );
  });

  test.each([
    ["another unique key", pg("23505", 'duplicate key value violates unique constraint "other_key"')],
    ["another check", pg("23514", 'violates check constraint "products_price_check"')],
    ["a plain error", new Error("boom")],
    ["something that is not an error", "boom"],
    ["nothing", undefined],
  ])("anything else (%s) gets a general message", (_case, error) => {
    expect(catalogErrorMessage(error)).toBe("No pudimos guardar. Intentá de nuevo");
  });
});

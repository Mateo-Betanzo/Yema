// What the Dashboard of the admin shows (spec 007: RF-7, RF-8, RF-10 to RF-13, RF-16). The base computes
// the eggs sold per type and period (admin_sales_by_type) and the stock (egg_type_overview); here they
// are only chosen, scaled and searched. Nothing here reads the clock: the periods are the base's.

export type SalesPeriod = "week" | "month" | "year";

const PERIOD_TEXT: Record<SalesPeriod, string> = {
  week: "esta semana",
  month: "este mes",
  year: "este año",
};

/** RF-8, RF-12: "esta semana", "este mes", "este año" ("Maples y packs vendidos …", "Sin ventas …"). */
export function periodText(period: SalesPeriod): string {
  return PERIOD_TEXT[period];
}

/** A row of admin_sales_by_type(): every type, in the order they were created. */
export type SalesRow = {
  egg_type_id: number;
  name: string;
  active: boolean;
  eggs_week: number;
  eggs_month: number;
  eggs_year: number;
};

export type SalesBar = { id: number; name: string; eggs: number; ratio: number; best: boolean };

const EGGS: Record<SalesPeriod, keyof Pick<SalesRow, "eggs_week" | "eggs_month" | "eggs_year">> = {
  week: "eggs_week",
  month: "eggs_month",
  year: "eggs_year",
};

/**
 * RF-7, RF-10 to RF-12: a bar per active type (at 0 if it sold nothing) and per inactive type that sold
 * in the period, in the order of the types, scaled to the one that sold most; every type that sold
 * most is the best seller. Nothing sold in the period: no bars.
 */
export function salesBars(
  rows: readonly SalesRow[],
  period: SalesPeriod,
): { kind: "empty" } | { kind: "bars"; bars: SalesBar[] } {
  const visible = rows
    .map((row) => ({ row, eggs: row[EGGS[period]] }))
    .filter(({ row, eggs }) => row.active || eggs > 0);
  const max = Math.max(0, ...visible.map(({ eggs }) => eggs));
  if (max === 0) return { kind: "empty" };
  return {
    kind: "bars",
    bars: visible.map(({ row, eggs }) => ({
      id: row.egg_type_id,
      name: row.name,
      eggs,
      ratio: eggs / max,
      best: eggs === max,
    })),
  };
}

/** What the inventory needs of a row of egg_type_overview (a view: every column may be null). */
export type StockType = { id: number | null; name: string | null; active: boolean | null; stock: number | null };

export type InventoryRow = { id: number; name: string; stock: number; ratio: number; colorIndex: number };

/**
 * RF-13: the active types in their order, with the stock scaled to the type with most stock. The color
 * of a type is its place among all types (active or not) in the palette, starting again after the
 * last one, so deactivating a type does not change the color of the others.
 */
export function inventoryRows(types: readonly StockType[], paletteSize: number): InventoryRow[] {
  const rows = types
    .map((type, position) => ({ type, colorIndex: position % paletteSize }))
    .filter(({ type }) => type.active === true)
    .map(({ type, colorIndex }) => ({ id: type.id ?? 0, name: type.name ?? "", stock: type.stock ?? 0, colorIndex }));
  const max = Math.max(0, ...rows.map((row) => row.stock));
  return rows.map(({ id, name, stock, colorIndex }) => ({
    id,
    name,
    stock,
    ratio: max === 0 ? 0 : stock / max,
    colorIndex,
  }));
}

// Without Intl nor String.prototype.normalize (AGENTS.md): the accents of Spanish, one by one. ñ stays.
const ACCENTS: Record<string, string> = { á: "a", é: "e", í: "i", ó: "o", ú: "u", ü: "u" };

/** RF-16: lower case and without accents, to compare a search with a name or an address. */
export function normalizeSearch(text: string): string {
  return text.toLowerCase().replace(/[áéíóúü]/g, (letter) => ACCENTS[letter] ?? letter);
}

/** What the search needs of a row of admin_order_overview. */
export type SearchableOrder = {
  id: number | null;
  client_first_name: string | null;
  client_last_name: string | null;
  address: string | null;
  /** The name written down for a counter sale (spec 008). */
  customer_name?: string | null;
};

/**
 * RF-16: the orders whose client's first or last name, number ("#187") or address contain the text,
 * without accents nor case; a counter sale also by the name written down (spec 008, RF-16). Empty
 * text: every order.
 */
export function searchOrders<T extends SearchableOrder>(orders: readonly T[], text: string): T[] {
  const query = normalizeSearch(text.trim());
  if (query === "") return [...orders];
  return orders.filter((order) => {
    const name = normalizeSearch(
      [order.client_first_name, order.client_last_name, order.customer_name].filter(Boolean).join(" "),
    );
    return name.includes(query) || `#${order.id}`.includes(query) || normalizeSearch(order.address ?? "").includes(query);
  });
}

// Spec 012: what the Edge Function daily-summary receives and asks the AI. Plain TypeScript, without Deno
// or npm: imports, so the app shares the type and Jest tests it.

/**
 * The facts of the day the app sends (RF-6 to RF-10): only totals, quantities and type names, already
 * computed by the base and written as the app shows them. Never data of clients.
 */
export type DailyFacts = {
  /** "$63.000" */
  incomeToday: string;
  deliveredToday: number;
  toDeliver: number;
  /** The best sellers of the week in maples and packs (spec 007, RF-10); empty without sales. */
  bestSellersWeek: string[];
  /** Active types with 10 packs or less: "4 packs". */
  lowStock: { type: string; packs: string }[];
  /** Active types missing eggs for the orders in progress: "30 huevos". */
  shortfalls: { type: string; eggs: string }[];
};

const FACT_KEYS = ["bestSellersWeek", "deliveredToday", "incomeToday", "lowStock", "shortfalls", "toDeliver"];
const MAX_TEXT = 60;
const MAX_TYPES = 50;
const MAX_ORDERS = 10_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactly(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const own = Object.keys(value).sort();
  return own.length === keys.length && [...keys].sort().every((key, index) => own[index] === key);
}

function isShortText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_TEXT;
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_ORDERS;
}

function isListOf(value: unknown, item: (entry: unknown) => boolean): boolean {
  return Array.isArray(value) && value.length <= MAX_TYPES && value.every(item);
}

function isTypeWith(field: string) {
  return (entry: unknown) =>
    isRecord(entry) && hasExactly(entry, ["type", field]) && isShortText(entry.type) && isShortText(entry[field]);
}

/**
 * RF-10: true only for an object with exactly the keys of DailyFacts, their types and bounded sizes, so the
 * function cannot be used to send the AI any other text, nor data of clients.
 */
export function isDailyFacts(value: unknown): value is DailyFacts {
  return (
    isRecord(value) &&
    hasExactly(value, FACT_KEYS) &&
    isShortText(value.incomeToday) &&
    isCount(value.deliveredToday) &&
    isCount(value.toDeliver) &&
    isListOf(value.bestSellersWeek, isShortText) &&
    isListOf(value.lowStock, isTypeWith("packs")) &&
    isListOf(value.shortfalls, isTypeWith("eggs"))
  );
}

const SYSTEM = [
  "Sos el asistente de un negocio de venta de huevos a domicilio en Argentina.",
  "Escribí el resumen del cierre del día para el dueño, en dos o tres oraciones y en hasta 320 caracteres en total,",
  "en español rioplatense con voseo, cálido y directo.",
  "Usá solo los números de los datos, escritos tal cual; no calcules ni agregues otros.",
  "Contá cuánto se entregó y cuánto quedó por entregar, y qué tipo se vendió más en la semana si hay ventas.",
  "Si hay tipos con 10 packs o menos, nombralos con los packs que les quedan; si a algún tipo le faltan huevos para los pedidos en curso, decí cuántos faltan.",
  "Si en el día no se entregó nada y no quedó nada por entregar, decilo sin inventar ventas.",
  'No digas "hoy" ni "ayer": el resumen se puede leer al día siguiente.',
  "Respondé solo con el resumen, sin títulos, listas ni comillas.",
].join(" ");

function listOr(items: readonly string[], none: string): string {
  return items.length > 0 ? items.join(", ") : none;
}

/** RF-6, RF-9, RF-11: the instructions and the facts of the day, as lines of text. */
export function summaryPrompt(facts: DailyFacts): { system: string; user: string } {
  const user = [
    `Ingresos del día: ${facts.incomeToday}`,
    `Pedidos entregados en el día: ${facts.deliveredToday}`,
    `Pedidos que quedaron por entregar: ${facts.toDeliver}`,
    facts.bestSellersWeek.length > 0
      ? `Más vendido de la semana (maples y packs): ${facts.bestSellersWeek.join(", ")}`
      : "Sin ventas en la semana",
    `Tipos con 10 packs o menos: ${listOr(facts.lowStock.map((row) => `${row.type} (${row.packs})`), "ninguno")}`,
    `Faltantes para los pedidos en curso: ${listOr(facts.shortfalls.map((row) => `${row.type} (${row.eggs})`), "ninguno")}`,
  ].join("\n");
  return { system: SYSTEM, user };
}

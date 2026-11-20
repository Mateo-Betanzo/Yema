// The stock in the unit the business thinks in (spec 003: RF-16, RF-22). A maple equivalent is always
// 30 eggs (spec definition), whatever the Maple format holds. The base computes the stock and the
// units (RF-35); these only write them.
import { formatNumber } from "./currency";

const MAPLE_EGGS = 30;

export function toMaples(eggs: number): { maples: number; eggs: number } {
  return { maples: Math.floor(eggs / MAPLE_EGGS), eggs: eggs % MAPLE_EGGS };
}

/** "375 huevos", "1 huevo". */
export function formatEggs(eggs: number): string {
  return `${formatNumber(eggs)} ${eggs === 1 ? "huevo" : "huevos"}`;
}

/** RF-22: "12 maples y 15 huevos", "1 maple", "15 huevos", "0 huevos". */
export function formatStock(stock: number): string {
  const { maples, eggs } = toMaples(stock);
  if (maples === 0) return formatEggs(eggs);
  const maplesText = `${formatNumber(maples)} ${maples === 1 ? "maple" : "maples"}`;
  return eggs === 0 ? maplesText : `${maplesText} y ${formatEggs(eggs)}`;
}

const PACK_EGGS = 180;

/** Spec 007, RF-7: whole maples, rounded down: "13 maples", "1 maple". */
export function formatMaples(eggs: number): string {
  const maples = Math.floor(eggs / MAPLE_EGGS);
  return `${formatNumber(maples)} ${maples === 1 ? "maple" : "maples"}`;
}

/** Spec 007, RF-7: whole packs, rounded down: "2 packs", "1 pack". */
export function formatPacks(eggs: number): string {
  const packs = Math.floor(eggs / PACK_EGGS);
  return `${formatNumber(packs)} ${packs === 1 ? "pack" : "packs"}`;
}

/**
 * Spec 007, RF-7, RF-13: whole maples and packs, rounded down, for the Dashboard: "13 maples · 2 packs",
 * "1 maple · 0 packs". What is left over is not shown (the exact stock is in Productos · Stock).
 */
export function formatMaplesAndPacks(eggs: number): string {
  return `${formatMaples(eggs)} · ${formatPacks(eggs)}`;
}

/** RF-16: "12 disponibles", "1 disponible", "Sin stock". */
export function formatUnits(units: number): string {
  if (units === 0) return "Sin stock";
  return `${formatNumber(units)} ${units === 1 ? "disponible" : "disponibles"}`;
}

/** Spec 004, RF-5, RF-18: the units left of a product in the Shop. "Quedan 3", "Queda 1", "Sin stock". */
export function formatRemaining(units: number): string {
  if (units === 0) return "Sin stock";
  return `${units === 1 ? "Queda" : "Quedan"} ${formatNumber(units)}`;
}

/** Spec 004, RF-38: the eggs missing for the active orders of a type, or null when none are missing. */
export function formatShortfall(eggs: number): string | null {
  if (eggs === 0) return null;
  return `${eggs === 1 ? "Falta" : "Faltan"} ${formatEggs(eggs)} para los pedidos en curso`;
}

const HIDDEN: Record<string, string> = {
  inactive: "Inactivo",
  type_inactive: "No visible: tipo inactivo",
  format_inactive: "No visible: formato inactivo",
};

/**
 * RF-16, RF-17: what the admin list says of a product, from the `status` and `units_available` of
 * product_overview (computed in the base). Only a visible product shows its units.
 */
export function productAvailability(status: string | null, units: number | null): { text: string; visible: boolean } {
  if (status === "visible") return { text: formatUnits(units ?? 0), visible: true };
  return { text: HIDDEN[status ?? "inactive"] ?? HIDDEN.inactive, visible: false };
}

/**
 * Spec 011, RF-12: a load or an adjustment of the "Historial de stock". "Carga · +1.080 huevos (6
 * packs)", "Ajuste · −12 huevos": a load adds and is entered in packs, an adjustment subtracts (spec 003).
 */
export function movementText(movement: { kind: "load" | "adjustment"; eggs: number; packs: number | null }): string {
  if (movement.kind === "adjustment") return `Ajuste · −${formatEggs(movement.eggs)}`;
  const packs = movement.packs ?? 0;
  return `Carga · +${formatEggs(movement.eggs)} (${formatNumber(packs)} ${packs === 1 ? "pack" : "packs"})`;
}

// The cart in memory (spec 004: RF-8, RF-11 to RF-15, RF-17, RF-18). It keeps only which products and
// how many, plus each name so a product that leaves the Shop can still be named. Prices and units always
// come from the last Shop update, and create_order checks everything again (RF-24 to RF-26): these
// limits only spare the client a rejected order.
import { formatNumber } from "./currency";
import { formatRemaining } from "./stock";

export const MAX_PER_PRODUCT = 5;

export type CartItem = { productId: number; name: string; quantity: number };
export type Cart = readonly CartItem[];

/** What the cart needs of a Shop product (a subset of ShopProduct). */
export type CartProduct = { id: number; name: string; price: number; units_available: number; available: boolean };

export type AddError = "max_per_product" | "no_more_units" | "unavailable";

/**
 * RF-8, RF-10 to RF-12: one more unit of a product, or why not. The counter sale of spec 008 uses the
 * same cart with a limit of 99.
 */
export function addUnit(cart: Cart, product: CartProduct, max = MAX_PER_PRODUCT): { cart: Cart; error?: AddError } {
  return addUnits(cart, product, 1, max);
}

/**
 * Spec 003, RF-39 and RF-40 (cambio del 2026-11-18): `quantity` more units of a product, with the rules
 * of addUnit; past a limit nothing is added.
 */
export function addUnits(
  cart: Cart,
  product: CartProduct,
  quantity: number,
  max = MAX_PER_PRODUCT,
): { cart: Cart; error?: AddError } {
  const current = quantityOf(cart, product.id);
  if (current === 0 && !product.available) return { cart, error: "unavailable" };
  if (current + quantity > max) return { cart, error: "max_per_product" };
  if (current + quantity > product.units_available) return { cart, error: "no_more_units" };
  if (current === 0) return { cart: [...cart, { productId: product.id, name: product.name, quantity }] };
  return {
    cart: cart.map((item) => (item.productId === product.id ? { ...item, quantity: item.quantity + quantity } : item)),
  };
}

/** Why the product screen cannot add any unit: the reasons of addUnit, or an active order (spec 004, RF-36). */
export type RoomReason = AddError | "active_order";

/**
 * Spec 003, RF-37 and RF-41 (cambio del 2026-11-18): how many more units of a product fit in the cart
 * (what is missing for 5 or for the units left, the lower), and why none when `max` is 0.
 */
export function addRoom(
  cart: Cart,
  product: CartProduct,
  hasActiveOrder = false,
): { max: number; reason: RoomReason | null } {
  if (hasActiveOrder) return { max: 0, reason: "active_order" };
  if (!product.available) return { max: 0, reason: "unavailable" };
  const current = quantityOf(cart, product.id);
  const byLimit = MAX_PER_PRODUCT - current;
  const byUnits = product.units_available - current;
  const max = Math.max(0, Math.min(byLimit, byUnits));
  if (max > 0) return { max, reason: null };
  return { max: 0, reason: byLimit <= 0 ? "max_per_product" : "no_more_units" };
}

/** The units of a product in the cart (0 if it has no line). */
export function quantityOf(cart: Cart, productId: number): number {
  return cart.find((item) => item.productId === productId)?.quantity ?? 0;
}

export function addErrorMessage(error: RoomReason, max = MAX_PER_PRODUCT): string {
  if (error === "active_order") return "Ya tenés un pedido en curso";
  if (error === "max_per_product") return `Máximo ${max} por producto`;
  return error === "no_more_units" ? "No quedan más unidades" : "Sin stock";
}

/** RF-14, RF-15: one unit less; the last one removes the line. */
export function removeUnit(cart: Cart, productId: number): Cart {
  return cart.flatMap((item) => {
    if (item.productId !== productId) return [item];
    return item.quantity > 1 ? [{ ...item, quantity: item.quantity - 1 }] : [];
  });
}

export type CartIssue = { kind: "not_for_sale" } | { kind: "short"; units: number };

export type CartLine = {
  productId: number;
  name: string;
  quantity: number;
  /** null when the product is no longer in the Shop. */
  price: number | null;
  subtotal: number;
  issue: CartIssue | null;
};

/** RF-17, RF-18: the cart crossed with the last Shop update (undefined while it loads). */
export function cartLines(cart: Cart, products: readonly CartProduct[] | undefined): CartLine[] {
  return cart.map((item) => {
    const product = products?.find((candidate) => candidate.id === item.productId);
    if (!product) {
      return { ...item, price: null, subtotal: 0, issue: { kind: "not_for_sale" } };
    }
    const issue: CartIssue | null =
      product.units_available < item.quantity ? { kind: "short", units: product.units_available } : null;
    return {
      productId: item.productId,
      name: product.name,
      quantity: item.quantity,
      price: product.price,
      subtotal: product.price * item.quantity,
      issue,
    };
  });
}

/** RF-18: what a marked line says ("Ya no está a la venta", "Queda 1"), or null. */
export function lineIssueText(line: CartLine): string | null {
  if (!line.issue) return null;
  return line.issue.kind === "not_for_sale" ? "Ya no está a la venta" : formatRemaining(line.issue.units);
}

/** RF-13, RF-18: total, units and whether the client can go on to the checkout. */
export function cartSummary(lines: readonly CartLine[]): { total: number; units: number; canContinue: boolean } {
  return {
    total: lines.reduce((sum, line) => sum + line.subtotal, 0),
    units: lines.reduce((sum, line) => sum + line.quantity, 0),
    canContinue: lines.length > 0 && lines.every((line) => line.issue === null),
  };
}

/** RF-13: "1 producto", "3 productos" (units, not lines). */
export function formatProductCount(units: number): string {
  return `${formatNumber(units)} ${units === 1 ? "producto" : "productos"}`;
}

/** Spec 010, RF-9: the accessible name of the cart button of the Home, which says what its badge shows. */
export function cartButtonLabel(units: number): string {
  return units === 0 ? "Carrito vacío" : `Carrito, ${formatProductCount(units)}`;
}

/** RF-24: what create_order receives. */
export function orderItems(cart: Cart): { product_id: number; quantity: number }[] {
  return cart.map((item) => ({ product_id: item.productId, quantity: item.quantity }));
}

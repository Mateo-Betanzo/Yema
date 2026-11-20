// The cart of the client, in memory (spec 004: RF-8, RF-11, RF-12, RF-15, RF-19). The state is only
// which products and how many (logic/cart.ts); prices and units come from the Shop. It lives in the
// client layout, so it is shared by the client screens and lost when the client group unmounts.
import { createContext, useContext, useReducer, type ReactNode } from "react";

import { addUnits, removeUnit, type AddError, type Cart, type CartProduct } from "@/logic/cart";

type Action = { type: "set"; cart: Cart } | { type: "remove"; productId: number } | { type: "clear" };

function reducer(cart: Cart, action: Action): Cart {
  switch (action.type) {
    case "set":
      return action.cart;
    case "remove":
      return removeUnit(cart, action.productId);
    case "clear":
      return [];
  }
}

type CartContextValue = {
  items: Cart;
  /**
   * One more unit, or `quantity` (the product screen, spec 003, RF-39 and RF-40); returns why not when
   * they cannot be added, and then adds nothing (RF-10 to RF-12).
   */
  add: (product: CartProduct, quantity?: number) => AddError | undefined;
  remove: (productId: number) => void;
  clear: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

/** `initialItems` starts the cart with some lines (tests); the app always starts empty. */
export function CartProvider({ children, initialItems = [] }: { children: ReactNode; initialItems?: Cart }) {
  const [items, dispatch] = useReducer(reducer, initialItems);

  // addUnits decides with the cart of this render: an add is one tap, so there is no queue of adds.
  function add(product: CartProduct, quantity = 1) {
    const result = addUnits(items, product, quantity);
    if (result.error) return result.error;
    dispatch({ type: "set", cart: result.cart });
    return undefined;
  }

  const value: CartContextValue = {
    items,
    add,
    remove: (productId) => dispatch({ type: "remove", productId }),
    clear: () => dispatch({ type: "clear" }),
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const value = useContext(CartContext);
  if (!value) throw new Error("useCart must be used inside CartProvider (src/app/client/_layout.tsx)");
  return value;
}

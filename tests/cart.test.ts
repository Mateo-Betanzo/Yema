import {
  addErrorMessage,
  addRoom,
  addUnit,
  addUnits,
  cartButtonLabel,
  cartLines,
  cartSummary,
  formatProductCount,
  lineIssueText,
  MAX_PER_PRODUCT,
  orderItems,
  removeUnit,
  type Cart,
  type CartLine,
  type CartProduct,
} from "@/logic/cart";

// Spec 004 · T5: the cart in memory (RF-8, RF-11, RF-12, RF-13, RF-15, RF-17, RF-18). It keeps only
// ids, names and quantities: prices and units always come from the last Shop update.
const product = (id: number, overrides: Partial<CartProduct> = {}): CartProduct => ({
  id,
  name: `Producto ${id}`,
  price: 1000 * id,
  units_available: 10,
  available: true,
  ...overrides,
});

describe("addUnit", () => {
  test("RF-8: the first unit of a product adds a line", () => {
    expect(addUnit([], product(1))).toEqual({ cart: [{ productId: 1, name: "Producto 1", quantity: 1 }] });
  });

  test("RF-8: another unit of the same product adds to its line, keeping the order of the lines", () => {
    const cart: Cart = [
      { productId: 1, name: "Producto 1", quantity: 1 },
      { productId: 2, name: "Producto 2", quantity: 2 },
    ];
    expect(addUnit(cart, product(1)).cart).toEqual([
      { productId: 1, name: "Producto 1", quantity: 2 },
      { productId: 2, name: "Producto 2", quantity: 2 },
    ]);
  });

  test("does not change the cart it receives", () => {
    const cart: Cart = [{ productId: 1, name: "Producto 1", quantity: 1 }];
    addUnit(cart, product(1));
    expect(cart).toEqual([{ productId: 1, name: "Producto 1", quantity: 1 }]);
  });

  test("RF-11: no more than 5 units of a product", () => {
    expect(MAX_PER_PRODUCT).toBe(5);
    const cart: Cart = [{ productId: 1, name: "Producto 1", quantity: 5 }];
    expect(addUnit(cart, product(1, { units_available: 20 }))).toEqual({ cart, error: "max_per_product" });
  });

  test("RF-11: the limit wins when it and the units are both reached", () => {
    const cart: Cart = [{ productId: 1, name: "Producto 1", quantity: 5 }];
    expect(addUnit(cart, product(1, { units_available: 5 })).error).toBe("max_per_product");
  });

  test("RF-12: no more units than are left", () => {
    const cart: Cart = [{ productId: 1, name: "Producto 1", quantity: 2 }];
    expect(addUnit(cart, product(1, { units_available: 2 }))).toEqual({ cart, error: "no_more_units" });
  });

  test("RF-10: a product that is not available is not added", () => {
    expect(addUnit([], product(1, { units_available: 0, available: false }))).toEqual({ cart: [], error: "unavailable" });
  });
});

// Spec 008 · T3: the counter sale uses the same cart with a limit of 99 (RF-3, RF-4).
describe("addUnit with another limit (spec 008)", () => {
  test("RF-3: past 5 when the limit is 99", () => {
    const cart: Cart = [{ productId: 1, name: "Producto 1", quantity: 5 }];
    expect(addUnit(cart, product(1, { units_available: 20 }), 99).cart).toEqual([
      { productId: 1, name: "Producto 1", quantity: 6 },
    ]);
  });

  test("RF-4: no more than 99, and no more than what is left", () => {
    const full: Cart = [{ productId: 1, name: "Producto 1", quantity: 99 }];
    expect(addUnit(full, product(1, { units_available: 500 }), 99).error).toBe("max_per_product");
    const short: Cart = [{ productId: 1, name: "Producto 1", quantity: 7 }];
    expect(addUnit(short, product(1, { units_available: 7 }), 99).error).toBe("no_more_units");
  });

  test("RF-4: the message says the limit", () => {
    expect(addErrorMessage("max_per_product", 99)).toBe("Máximo 99 por producto");
    expect(addErrorMessage("max_per_product")).toBe("Máximo 5 por producto");
  });
});

// Spec 003 · T11 (cambio del 2026-11-18): the product screen adds N units at once (RF-37, RF-41).
describe("addRoom", () => {
  const line = (quantity: number): Cart => [{ productId: 1, name: "Producto 1", quantity }];

  test("RF-37: with nothing in the cart, up to 5", () => {
    expect(addRoom([], product(1, { units_available: 20 }))).toEqual({ max: 5, reason: null });
  });

  test("RF-37: what is in the cart counts: with 3, up to 2 more", () => {
    expect(addRoom(line(3), product(1, { units_available: 20 }))).toEqual({ max: 2, reason: null });
  });

  test("RF-37: no more than what is left, minus what the cart has", () => {
    expect(addRoom([], product(1, { units_available: 2 }))).toEqual({ max: 2, reason: null });
    expect(addRoom(line(1), product(1, { units_available: 3 }))).toEqual({ max: 2, reason: null });
  });

  test("only the line of that product counts", () => {
    const cart: Cart = [{ productId: 2, name: "Producto 2", quantity: 5 }];
    expect(addRoom(cart, product(1))).toEqual({ max: 5, reason: null });
  });

  test("RF-41: with 5 in the cart, none: Máximo 5 por producto (also when the units ran out too)", () => {
    expect(addRoom(line(5), product(1, { units_available: 20 }))).toEqual({ max: 0, reason: "max_per_product" });
    expect(addRoom(line(5), product(1, { units_available: 5 }))).toEqual({ max: 0, reason: "max_per_product" });
  });

  test("RF-41: with every unit left already in the cart, none: No quedan más unidades", () => {
    expect(addRoom(line(2), product(1, { units_available: 2 }))).toEqual({ max: 0, reason: "no_more_units" });
  });

  test("RF-41: a product without stock: Sin stock", () => {
    expect(addRoom([], product(1, { units_available: 0, available: false }))).toEqual({ max: 0, reason: "unavailable" });
  });

  test("RF-41: an active order wins over everything else", () => {
    expect(addRoom([], product(1), true)).toEqual({ max: 0, reason: "active_order" });
    expect(addRoom([], product(1, { units_available: 0, available: false }), true)).toEqual({
      max: 0,
      reason: "active_order",
    });
  });
});

describe("addUnits", () => {
  test("RF-39, RF-40: N units of a new product add one line with N", () => {
    expect(addUnits([], product(1), 3)).toEqual({ cart: [{ productId: 1, name: "Producto 1", quantity: 3 }] });
  });

  test("RF-39, RF-40: N units more of a product in the cart add to its line", () => {
    const cart: Cart = [{ productId: 1, name: "Producto 1", quantity: 2 }];
    expect(addUnits(cart, product(1), 3).cart).toEqual([{ productId: 1, name: "Producto 1", quantity: 5 }]);
  });

  test("RF-41: past the limit or the units left, nothing is added", () => {
    const cart: Cart = [{ productId: 1, name: "Producto 1", quantity: 3 }];
    expect(addUnits(cart, product(1, { units_available: 20 }), 3)).toEqual({ cart, error: "max_per_product" });
    expect(addUnits(cart, product(1, { units_available: 4 }), 2)).toEqual({ cart, error: "no_more_units" });
    expect(addUnits([], product(1, { units_available: 0, available: false }), 1)).toEqual({ cart: [], error: "unavailable" });
  });

  test("addUnit is addUnits with 1", () => {
    const cart: Cart = [{ productId: 1, name: "Producto 1", quantity: 1 }];
    expect(addUnit(cart, product(1))).toEqual(addUnits(cart, product(1), 1));
  });
});

describe("addErrorMessage", () => {
  test.each([
    ["max_per_product", "Máximo 5 por producto"],
    ["no_more_units", "No quedan más unidades"],
    ["unavailable", "Sin stock"],
    ["active_order", "Ya tenés un pedido en curso"],
  ] as const)("%s → %j", (error, message) => {
    expect(addErrorMessage(error)).toBe(message);
  });
});

describe("removeUnit", () => {
  test("RF-14: takes one unit from a line", () => {
    const cart: Cart = [{ productId: 1, name: "Producto 1", quantity: 3 }];
    expect(removeUnit(cart, 1)).toEqual([{ productId: 1, name: "Producto 1", quantity: 2 }]);
  });

  test("RF-15: the last unit removes the line", () => {
    const cart: Cart = [
      { productId: 1, name: "Producto 1", quantity: 1 },
      { productId: 2, name: "Producto 2", quantity: 1 },
    ];
    expect(removeUnit(cart, 1)).toEqual([{ productId: 2, name: "Producto 2", quantity: 1 }]);
  });

  test("a product that is not in the cart changes nothing", () => {
    const cart: Cart = [{ productId: 1, name: "Producto 1", quantity: 1 }];
    expect(removeUnit(cart, 9)).toEqual(cart);
  });
});

describe("cartLines (RF-17, RF-18)", () => {
  test("RF-17: each line with the price of the last Shop update and its subtotal", () => {
    const cart: Cart = [{ productId: 2, name: "Viejo nombre", quantity: 3 }];
    expect(cartLines(cart, [product(2, { name: "Pack Mediano", price: 10500 })])).toEqual([
      { productId: 2, name: "Pack Mediano", quantity: 3, price: 10500, subtotal: 31500, issue: null },
    ]);
  });

  test("RF-18: a product that left the Shop is not for sale, without price, with the name it had", () => {
    const cart: Cart = [{ productId: 7, name: "Maple Super", quantity: 2 }];
    expect(cartLines(cart, [product(1)])).toEqual([
      { productId: 7, name: "Maple Super", quantity: 2, price: null, subtotal: 0, issue: { kind: "not_for_sale" } },
    ]);
  });

  test("RF-18: a product with fewer units left than its quantity is short", () => {
    const cart: Cart = [{ productId: 1, name: "Producto 1", quantity: 4 }];
    expect(cartLines(cart, [product(1, { units_available: 3 })])[0].issue).toEqual({ kind: "short", units: 3 });
  });

  test("RF-18: a product without stock is short with 0 units", () => {
    const cart: Cart = [{ productId: 1, name: "Producto 1", quantity: 1 }];
    expect(cartLines(cart, [product(1, { units_available: 0, available: false })])[0].issue).toEqual({
      kind: "short",
      units: 0,
    });
  });

  test("exactly the units left is fine", () => {
    const cart: Cart = [{ productId: 1, name: "Producto 1", quantity: 3 }];
    expect(cartLines(cart, [product(1, { units_available: 3 })])[0].issue).toBeNull();
  });

  test("while the Shop has not loaded, every line is not for sale", () => {
    const cart: Cart = [{ productId: 1, name: "Producto 1", quantity: 1 }];
    expect(cartLines(cart, undefined)[0].issue).toEqual({ kind: "not_for_sale" });
  });
});

describe("cartSummary (RF-13, RF-18)", () => {
  test("RF-13: the total of the subtotals and the units of every line", () => {
    const lines = cartLines(
      [
        { productId: 1, name: "Producto 1", quantity: 2 },
        { productId: 2, name: "Producto 2", quantity: 1 },
      ],
      [product(1), product(2)],
    );
    expect(cartSummary(lines)).toEqual({ total: 4000, units: 3, canContinue: true });
  });

  test("RF-18: a line with an issue does not let the client continue", () => {
    const lines = cartLines([{ productId: 1, name: "Producto 1", quantity: 2 }], [product(1, { units_available: 1 })]);
    expect(cartSummary(lines).canContinue).toBe(false);
  });

  test("an empty cart does not let the client continue", () => {
    expect(cartSummary([])).toEqual({ total: 0, units: 0, canContinue: false });
  });
});

describe("formatProductCount (RF-13)", () => {
  test.each([
    [1, "1 producto"],
    [3, "3 productos"],
    [25, "25 productos"],
  ])("%d → %j", (units, text) => {
    expect(formatProductCount(units)).toBe(text);
  });
});

// Spec 010, RF-9: the accessible name of the cart button in the header of the Home.
describe("cartButtonLabel (spec 010, RF-9)", () => {
  test.each([
    [0, "Carrito vacío"],
    [1, "Carrito, 1 producto"],
    [3, "Carrito, 3 productos"],
  ])("%d → %j", (units, label) => {
    expect(cartButtonLabel(units)).toBe(label);
  });
});

describe("orderItems (RF-24)", () => {
  test("what create_order receives: only ids and quantities", () => {
    const cart: Cart = [
      { productId: 1, name: "Producto 1", quantity: 2 },
      { productId: 4, name: "Producto 4", quantity: 5 },
    ];
    expect(orderItems(cart)).toEqual([
      { product_id: 1, quantity: 2 },
      { product_id: 4, quantity: 5 },
    ]);
  });
});

describe("lineIssueText (RF-18)", () => {
  const line = (issue: CartLine["issue"]): CartLine => ({ productId: 1, name: "P", quantity: 2, price: 1000, subtotal: 2000, issue });

  test.each([
    [null, null],
    [{ kind: "not_for_sale" } as const, "Ya no está a la venta"],
    [{ kind: "short", units: 1 } as const, "Queda 1"],
    [{ kind: "short", units: 0 } as const, "Sin stock"],
  ])("%j → %j", (issue, text) => {
    expect(lineIssueText(line(issue))).toBe(text);
  });
});

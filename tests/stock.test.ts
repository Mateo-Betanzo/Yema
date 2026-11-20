import {
  formatEggs,
  formatMaples,
  formatMaplesAndPacks,
  formatPacks,
  formatRemaining,
  formatShortfall,
  formatStock,
  formatUnits,
  movementText,
  productAvailability,
  toMaples,
} from "@/logic/stock";

// Spec 003 · T5: the stock in the unit the business thinks in (RF-16, RF-22). A maple equivalent is
// always 30 eggs (spec definition), whatever the Maple format holds.
describe("toMaples", () => {
  test.each([
    [0, { maples: 0, eggs: 0 }],
    [29, { maples: 0, eggs: 29 }],
    [30, { maples: 1, eggs: 0 }],
    [375, { maples: 12, eggs: 15 }],
  ])("%d eggs → %o", (eggs, expected) => {
    expect(toMaples(eggs)).toEqual(expected);
  });
});

describe("formatStock (RF-22)", () => {
  test.each([
    [0, "0 huevos"],
    [1, "1 huevo"],
    [15, "15 huevos"],
    [30, "1 maple"],
    [31, "1 maple y 1 huevo"],
    [60, "2 maples"],
    [375, "12 maples y 15 huevos"],
    [36000, "1.200 maples"],
  ])("%d → %j", (eggs, text) => {
    expect(formatStock(eggs)).toBe(text);
  });
});

describe("formatEggs (RF-22: the exact total)", () => {
  test.each([
    [0, "0 huevos"],
    [1, "1 huevo"],
    [375, "375 huevos"],
    [36000, "36.000 huevos"],
  ])("%d → %j", (eggs, text) => {
    expect(formatEggs(eggs)).toBe(text);
  });
});

describe("formatUnits (RF-16)", () => {
  test.each([
    [0, "Sin stock"],
    [1, "1 disponible"],
    [12, "12 disponibles"],
    [1200, "1.200 disponibles"],
  ])("%d → %j", (units, text) => {
    expect(formatUnits(units)).toBe(text);
  });
});

describe("productAvailability: what the admin list says of each product (RF-16, RF-17)", () => {
  test.each([
    ["visible", 12, "12 disponibles", true],
    ["visible", 0, "Sin stock", true],
    ["inactive", 12, "Inactivo", false],
    ["type_inactive", 12, "No visible: tipo inactivo", false],
    ["format_inactive", 12, "No visible: formato inactivo", false],
  ] as const)("%s with %d units → %j", (status, units, text, visible) => {
    expect(productAvailability(status, units)).toEqual({ text, visible });
  });

  test("missing values from the view count as not visible and no units", () => {
    expect(productAvailability(null, null)).toEqual({ text: "Inactivo", visible: false });
    expect(productAvailability("visible", null)).toEqual({ text: "Sin stock", visible: true });
  });
});

// Spec 004 · T5: the units left in the Shop and the eggs missing for the active orders.
describe("formatRemaining (RF-5, RF-18)", () => {
  test.each([
    [0, "Sin stock"],
    [1, "Queda 1"],
    [3, "Quedan 3"],
    [1200, "Quedan 1.200"],
  ])("%d → %j", (units, text) => {
    expect(formatRemaining(units)).toBe(text);
  });
});

describe("formatShortfall (RF-38)", () => {
  test.each([
    [1, "Falta 1 huevo para los pedidos en curso"],
    [30, "Faltan 30 huevos para los pedidos en curso"],
    [1500, "Faltan 1.500 huevos para los pedidos en curso"],
  ])("%d → %j", (eggs, text) => {
    expect(formatShortfall(eggs)).toBe(text);
  });

  test("nothing to say when no eggs are missing", () => {
    expect(formatShortfall(0)).toBeNull();
  });
});

// Spec 007 · T2: the sales by type and the inventory of the Dashboard in maples and packs, rounded down
// (RF-7, RF-13); the exact eggs stay in Productos · Stock.
describe("formatMaplesAndPacks (spec 007, RF-7, RF-13)", () => {
  test.each([
    [0, "0 maples · 0 packs"],
    [30, "1 maple · 0 packs"],
    [180, "6 maples · 1 pack"],
    [390, "13 maples · 2 packs"],
    [375, "12 maples · 2 packs"],
    [29, "0 maples · 0 packs"],
    [36000, "1.200 maples · 200 packs"],
  ])("%d eggs → %j", (eggs, text) => {
    expect(formatMaplesAndPacks(eggs)).toBe(text);
  });
});

describe("formatMaples and formatPacks (spec 007, RF-7: one per line under a bar)", () => {
  test.each([
    [0, "0 maples", "0 packs"],
    [30, "1 maple", "0 packs"],
    [180, "6 maples", "1 pack"],
    [390, "13 maples", "2 packs"],
    [36000, "1.200 maples", "200 packs"],
  ])("%d eggs → %j and %j", (eggs, maples, packs) => {
    expect(formatMaples(eggs)).toBe(maples);
    expect(formatPacks(eggs)).toBe(packs);
  });
});

describe("movementText (spec 011, RF-12)", () => {
  it("writes a load with its eggs and packs", () => {
    expect(movementText({ kind: "load", eggs: 1080, packs: 6 })).toBe("Carga · +1.080 huevos (6 packs)");
    expect(movementText({ kind: "load", eggs: 180, packs: 1 })).toBe("Carga · +180 huevos (1 pack)");
  });

  it("writes an adjustment with the eggs it took", () => {
    expect(movementText({ kind: "adjustment", eggs: 12, packs: null })).toBe("Ajuste · −12 huevos");
    expect(movementText({ kind: "adjustment", eggs: 1, packs: null })).toBe("Ajuste · −1 huevo");
    expect(movementText({ kind: "adjustment", eggs: 1200, packs: null })).toBe("Ajuste · −1.200 huevos");
  });
});

import {
  inventoryRows,
  normalizeSearch,
  periodText,
  salesBars,
  searchOrders,
  type SalesRow,
  type SearchableOrder,
  type StockType,
} from "@/logic/admin-dashboard";

// Spec 007 · T2: what the Dashboard shows of the sales by type, the inventory and the history search
// (RF-7, RF-8, RF-10 to RF-13, RF-16). The base computes the eggs and the stock; these only choose,
// scale and find.

const row = (fields: Partial<SalesRow> & { egg_type_id: number }): SalesRow => ({
  name: `Tipo ${fields.egg_type_id}`,
  active: true,
  eggs_week: 0,
  eggs_month: 0,
  eggs_year: 0,
  ...fields,
});

describe("periodText (RF-8, RF-12)", () => {
  test.each([
    ["week", "esta semana"],
    ["month", "este mes"],
    ["year", "este año"],
  ] as const)("%s → %s", (period, text) => {
    expect(periodText(period)).toBe(text);
  });
});

describe("salesBars", () => {
  const rows = [
    row({ egg_type_id: 1, name: "Medianos", eggs_week: 240, eggs_month: 270, eggs_year: 630 }),
    row({ egg_type_id: 2, name: "Grandes", eggs_week: 90, eggs_month: 540, eggs_year: 540 }),
    row({ egg_type_id: 3, name: "Super" }),
    row({ egg_type_id: 4, name: "Viejos", active: false, eggs_year: 30 }),
    row({ egg_type_id: 5, name: "Sin uso", active: false }),
  ];

  test("RF-7, RF-11: each active type in its order, scaled to the one that sold most in the period", () => {
    expect(salesBars(rows, "week")).toEqual({
      kind: "bars",
      bars: [
        { id: 1, name: "Medianos", eggs: 240, ratio: 1, best: true },
        { id: 2, name: "Grandes", eggs: 90, ratio: 0.375, best: false },
        { id: 3, name: "Super", eggs: 0, ratio: 0, best: false },
      ],
    });
  });

  test("RF-9: the same rows give the bars of another period", () => {
    const result = salesBars(rows, "month");
    expect(result.kind === "bars" && result.bars.map((bar) => [bar.name, bar.eggs, bar.best])).toEqual([
      ["Medianos", 270, false],
      ["Grandes", 540, true],
      ["Super", 0, false],
    ]);
  });

  test("RF-11: an inactive type shows only in a period it sold in", () => {
    const result = salesBars(rows, "year");
    expect(result.kind === "bars" && result.bars.map((bar) => bar.name)).toEqual([
      "Medianos",
      "Grandes",
      "Super",
      "Viejos",
    ]);
  });

  test("RF-10: a tie marks every type that sold most", () => {
    const tie = [
      row({ egg_type_id: 1, eggs_month: 180 }),
      row({ egg_type_id: 2, eggs_month: 60 }),
      row({ egg_type_id: 3, eggs_month: 180 }),
    ];
    const result = salesBars(tie, "month");
    expect(result.kind === "bars" && result.bars.map((bar) => bar.best)).toEqual([true, false, true]);
  });

  test("RF-12: nothing sold in the period, no bars", () => {
    expect(salesBars(rows.map((r) => ({ ...r, eggs_week: 0 })), "week")).toEqual({ kind: "empty" });
    expect(salesBars([], "month")).toEqual({ kind: "empty" });
  });
});

describe("inventoryRows (RF-13)", () => {
  const type = (id: number, stock: number, active = true): StockType => ({ id, name: `Tipo ${id}`, active, stock });

  test("the active types in their order, scaled to the one with most stock", () => {
    expect(inventoryRows([type(1, 900), type(2, 450), type(3, 0)], 4)).toEqual([
      { id: 1, name: "Tipo 1", stock: 900, ratio: 1, colorIndex: 0 },
      { id: 2, name: "Tipo 2", stock: 450, ratio: 0.5, colorIndex: 1 },
      { id: 3, name: "Tipo 3", stock: 0, ratio: 0, colorIndex: 2 },
    ]);
  });

  test("the colors start again from the 5th type", () => {
    const rows = inventoryRows([1, 2, 3, 4, 5, 6].map((id) => type(id, 30)), 4);
    expect(rows.map((r) => r.colorIndex)).toEqual([0, 1, 2, 3, 0, 1]);
  });

  test("an inactive type is left out and the others keep their color", () => {
    const rows = inventoryRows([type(1, 30), type(2, 30, false), type(3, 30)], 4);
    expect(rows.map((r) => [r.id, r.colorIndex])).toEqual([
      [1, 0],
      [3, 2],
    ]);
  });

  test("without stock at all, every bar is empty", () => {
    expect(inventoryRows([type(1, 0), type(2, 0)], 4).map((r) => r.ratio)).toEqual([0, 0]);
  });

  test("no active types, no rows", () => {
    expect(inventoryRows([type(1, 30, false)], 4)).toEqual([]);
  });

  test("a row of the view without a value reads as empty", () => {
    expect(inventoryRows([{ id: 1, name: null, active: true, stock: null }], 4)).toEqual([
      { id: 1, name: "", stock: 0, ratio: 0, colorIndex: 0 },
    ]);
  });
});

describe("normalizeSearch (RF-16)", () => {
  test("lower case and without accents, ñ kept", () => {
    expect(normalizeSearch("Rocío FERNÁNDEZ")).toBe("rocio fernandez");
    expect(normalizeSearch("Güemes Ñandú")).toBe("guemes ñandu");
    expect(normalizeSearch("ÁÉÍÓÚ áéíóú")).toBe("aeiou aeiou");
  });
});

describe("searchOrders (RF-16)", () => {
  const order = (fields: Partial<SearchableOrder> & { id: number }): SearchableOrder => ({
    client_first_name: "Ana",
    client_last_name: "Pérez",
    address: "Calle 1",
    ...fields,
  });
  const rocio = order({ id: 187, client_first_name: "Rocío", client_last_name: "Fernández", address: "Av. Rivadavia 4521" });
  const juan = order({ id: 1180, client_first_name: "Juan", client_last_name: "Gómez", address: "Güemes 300" });
  const ana = order({ id: 42 });
  const orders = [rocio, juan, ana];

  test("by first or last name, without accents nor case", () => {
    expect(searchOrders(orders, "rocio")).toEqual([rocio]);
    expect(searchOrders(orders, "GOMEZ")).toEqual([juan]);
    expect(searchOrders(orders, "rocío fern")).toEqual([rocio]);
  });

  test("by number: the text is inside '#187', so '18' finds #187 and #1180, and '#18' only the numbers starting with 18", () => {
    expect(searchOrders(orders, "18")).toEqual([rocio, juan]);
    expect(searchOrders(orders, "#18")).toEqual([rocio]);
    expect(searchOrders(orders, "#42")).toEqual([ana]);
  });

  test("by the address of the order", () => {
    expect(searchOrders(orders, "rivadavia")).toEqual([rocio]);
    expect(searchOrders(orders, "guemes")).toEqual([juan]);
  });

  test("empty or blank text gives every order; spaces around are ignored", () => {
    expect(searchOrders(orders, "")).toEqual(orders);
    expect(searchOrders(orders, "   ")).toEqual(orders);
    expect(searchOrders(orders, "  ana ")).toEqual([ana]);
  });

  test("nothing found", () => {
    expect(searchOrders(orders, "zzz")).toEqual([]);
  });

  test("spec 008, RF-16: a counter sale is found by the name written down", () => {
    const sale = order({ id: 212, client_first_name: null, client_last_name: null, address: null, customer_name: "Doña Rosa" });
    expect(searchOrders([...orders, sale], "ROSA")).toEqual([sale]);
  });

  test("a client without a name can still be found by number or address", () => {
    const nameless = order({ id: 7, client_first_name: null, client_last_name: null, address: "Mitre 10" });
    expect(searchOrders([nameless], "mitre")).toEqual([nameless]);
    expect(searchOrders([nameless], "#7")).toEqual([nameless]);
  });
});

import { dailyFacts, summaryCardState, trimSummary, type StoredSummary } from "@/logic/daily-summary";

// Spec 012 · T1: the facts the AI receives, which card the Dashboard shows and how a long text is cut
// (RF-3, RF-4, RF-6 to RF-10, RF-12 to RF-14). The base computes every number (spec 007); these only
// choose and write them, and decide with "now" in Buenos Aires (UTC−3): 21:00 there is 00:00 UTC.

const TOTALS = { income_today: 63000, delivered_today: 6, to_deliver: 3 };
const sale = (egg_type_id: number, name: string, eggs_week: number, active = true) => ({
  egg_type_id,
  name,
  active,
  eggs_week,
  eggs_month: eggs_week,
  eggs_year: eggs_week,
});
const type = (name: string, stock: number, shortfall = 0, active = true) => ({ id: 1, name, active, stock, shortfall });

describe("dailyFacts (RF-6 to RF-10)", () => {
  const facts = dailyFacts({
    totals: TOTALS,
    sales: [sale(1, "Medianos", 360), sale(2, "Grandes", 720), sale(3, "Super", 180)],
    stock: [type("Medianos", 5400), type("Grandes", 1800), type("Super", 720, 30), type("Cajitas", 90, 0, false)],
  });

  test("RF-6: the income of the day as the app writes it, and the orders delivered and to deliver", () => {
    expect(facts.incomeToday).toBe("$63.000");
    expect(facts.deliveredToday).toBe(6);
    expect(facts.toDeliver).toBe(3);
  });

  test("RF-6: the best seller of the week is the one of Ventas por tipo (spec 007)", () => {
    expect(facts.bestSellersWeek).toEqual(["Grandes"]);
  });

  test("RF-6: every type tied as best seller is named, and without sales this week nobody is", () => {
    const tied = dailyFacts({ totals: TOTALS, sales: [sale(1, "Medianos", 360), sale(2, "Grandes", 360)], stock: [] });
    expect(tied.bestSellersWeek).toEqual(["Medianos", "Grandes"]);
    const none = dailyFacts({ totals: TOTALS, sales: [sale(1, "Medianos", 0)], stock: [] });
    expect(none.bestSellersWeek).toEqual([]);
  });

  test("RF-7: an active type with 10 packs or less (1.800 eggs) is low, with its packs written", () => {
    expect(facts.lowStock).toEqual([
      { type: "Grandes", packs: "10 packs" },
      { type: "Super", packs: "4 packs" },
    ]);
  });

  test("RF-7: 1.801 eggs is not low, and an inactive type does not count", () => {
    const facts1801 = dailyFacts({ totals: TOTALS, sales: [], stock: [type("Medianos", 1801), type("Cajitas", 0, 0, false)] });
    expect(facts1801.lowStock).toEqual([]);
  });

  test("RF-8: the eggs missing for the orders in progress of each active type", () => {
    expect(facts.shortfalls).toEqual([{ type: "Super", eggs: "30 huevos" }]);
  });

  test("RF-10: only totals, quantities and type names: no other field reaches the AI", () => {
    expect(Object.keys(facts).sort()).toEqual(
      ["bestSellersWeek", "deliveredToday", "incomeToday", "lowStock", "shortfalls", "toDeliver"].sort(),
    );
  });

  test("RF-9: a day without movement has zeros, not invented sales", () => {
    const quiet = dailyFacts({ totals: { income_today: 0, delivered_today: 0, to_deliver: 0 }, sales: [], stock: [] });
    expect(quiet).toEqual({
      incomeToday: "$0",
      deliveredToday: 0,
      toDeliver: 0,
      bestSellersWeek: [],
      lowStock: [],
      shortfalls: [],
    });
  });
});

describe("summaryCardState (RF-12 to RF-14)", () => {
  // Thursday 19 November 2026 in Buenos Aires.
  const at = (iso: string) => new Date(iso);
  const today: StoredSummary = { date: "2026-11-19", text: "Del jueves." };
  const yesterday: StoredSummary = { date: "2026-11-18", text: "Del miércoles." };
  const older: StoredSummary = { date: "2026-11-17", text: "Del martes." };

  test("RF-14: before 21:00, yesterday's summary as Resumen de ayer", () => {
    expect(summaryCardState(yesterday, at("2026-11-19T23:59:00Z"))).toEqual({ kind: "yesterday", text: "Del miércoles." });
  });

  test("RF-14: before 21:00 without yesterday's, the notice that it is made at 21 h", () => {
    expect(summaryCardState(null, at("2026-11-19T15:00:00Z"))).toEqual({ kind: "waiting" });
    expect(summaryCardState(older, at("2026-11-19T15:00:00Z"))).toEqual({ kind: "waiting" });
  });

  test("RF-12: from 21:00 without today's, it is due (yesterday's no longer counts)", () => {
    expect(summaryCardState(yesterday, at("2026-11-20T00:00:00Z"))).toEqual({ kind: "due" });
    expect(summaryCardState(null, at("2026-11-20T00:00:00Z"))).toEqual({ kind: "due" });
  });

  test("RF-13: from 21:00 with today's stored, it is shown as it is", () => {
    expect(summaryCardState(today, at("2026-11-20T00:00:00Z"))).toEqual({ kind: "today", text: "Del jueves." });
    expect(summaryCardState(today, at("2026-11-20T02:59:00Z"))).toEqual({ kind: "today", text: "Del jueves." });
  });

  test("RF-14: past midnight, today's becomes yesterday's", () => {
    expect(summaryCardState(today, at("2026-11-20T03:01:00Z"))).toEqual({ kind: "yesterday", text: "Del jueves." });
  });

  test("a stored summary of a day that has not come yet (a clock set back) is not shown", () => {
    expect(summaryCardState({ date: "2026-11-21", text: "?" }, at("2026-11-19T15:00:00Z"))).toEqual({ kind: "waiting" });
  });
});

describe("trimSummary (RF-3, RF-4)", () => {
  test("RF-3: up to three sentences that fit stay as they are", () => {
    const text = "Entregaste 6 pedidos por $63.000. Quedaron 3 por entregar. Los Grandes fueron los más vendidos.";
    expect(trimSummary(`  ${text}  `)).toBe(text);
  });

  test("RF-4: a fourth sentence is left out", () => {
    expect(trimSummary("Uno. Dos. Tres. Cuatro.")).toBe("Uno. Dos. Tres.");
  });

  test("RF-4: past 320 characters, it keeps the complete sentences that fit", () => {
    const first = `${"a".repeat(200)}.`;
    const second = `${"b".repeat(129)}.`;
    expect(trimSummary(`${first} ${second}`)).toBe(first);
  });

  test("RF-4: the dot of an amount ($63.000) does not end a sentence", () => {
    expect(trimSummary("Vendiste $63.000 en el día. Bien.")).toBe("Vendiste $63.000 en el día. Bien.");
  });

  test("RF-4: a single sentence longer than 320 characters, or nothing, is an error (null)", () => {
    expect(trimSummary(`${"a".repeat(321)}.`)).toBeNull();
    expect(trimSummary("")).toBeNull();
    expect(trimSummary("   ")).toBeNull();
  });
});

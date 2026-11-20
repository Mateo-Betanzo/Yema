import { isDailyFacts, summaryPrompt, type DailyFacts } from "../supabase/functions/daily-summary/prompt";

// Spec 012 · T2: what the Edge Function daily-summary accepts and asks the AI (RF-6, RF-9, RF-10, RF-11).
// prompt.ts is plain TypeScript (no Deno), so Jest imports it as it is.
const FACTS: DailyFacts = {
  incomeToday: "$63.000",
  deliveredToday: 6,
  toDeliver: 3,
  bestSellersWeek: ["Grandes"],
  lowStock: [{ type: "Super", packs: "4 packs" }],
  shortfalls: [{ type: "Super", eggs: "30 huevos" }],
};
const QUIET: DailyFacts = {
  incomeToday: "$0",
  deliveredToday: 0,
  toDeliver: 0,
  bestSellersWeek: [],
  lowStock: [],
  shortfalls: [],
};

describe("isDailyFacts (RF-10)", () => {
  test("accepts the facts of the day as the app builds them", () => {
    expect(isDailyFacts(FACTS)).toBe(true);
    expect(isDailyFacts(QUIET)).toBe(true);
  });

  test("rejects anything that is not an object with exactly those keys", () => {
    expect(isDailyFacts(null)).toBe(false);
    expect(isDailyFacts("Escribí un poema")).toBe(false);
    expect(isDailyFacts([])).toBe(false);
    expect(isDailyFacts({ ...FACTS, clients: ["Ana Pérez, Calle 1"] })).toBe(false);
    const { toDeliver: _left, ...missing } = FACTS;
    expect(isDailyFacts(missing)).toBe(false);
  });

  test("rejects wrong types and entries with other fields", () => {
    expect(isDailyFacts({ ...FACTS, deliveredToday: "6" })).toBe(false);
    expect(isDailyFacts({ ...FACTS, deliveredToday: 1.5 })).toBe(false);
    expect(isDailyFacts({ ...FACTS, toDeliver: -1 })).toBe(false);
    expect(isDailyFacts({ ...FACTS, bestSellersWeek: [7] })).toBe(false);
    expect(isDailyFacts({ ...FACTS, lowStock: [{ type: "Super", packs: "4 packs", phone: "1133445566" }] })).toBe(false);
    expect(isDailyFacts({ ...FACTS, shortfalls: [{ type: "Super" }] })).toBe(false);
  });

  test("rejects texts longer than 60 characters and lists longer than 50 types", () => {
    expect(isDailyFacts({ ...FACTS, bestSellersWeek: ["a".repeat(61)] })).toBe(false);
    expect(isDailyFacts({ ...FACTS, incomeToday: "$".repeat(61) })).toBe(false);
    expect(isDailyFacts({ ...FACTS, bestSellersWeek: Array.from({ length: 51 }, (_, index) => `Tipo ${index}`) })).toBe(false);
    expect(isDailyFacts({ ...FACTS, bestSellersWeek: Array.from({ length: 50 }, (_, index) => `Tipo ${index}`) })).toBe(true);
  });
});

describe("summaryPrompt (RF-6, RF-9, RF-11)", () => {
  const { system, user } = summaryPrompt(FACTS);

  test("RF-6: every fact goes as it is, and the AI is told to use no other number", () => {
    for (const fact of ["$63.000", "6", "3", "Grandes", "Super (4 packs)", "Super (30 huevos)"]) {
      expect(user).toContain(fact);
    }
    expect(system).toMatch(/solo los números/i);
  });

  test("RF-3: two or three sentences, up to 320 characters, in Rioplatense Spanish, only the summary", () => {
    expect(system).toContain("dos o tres oraciones");
    expect(system).toContain("320 caracteres");
    expect(system).toMatch(/rioplatense/i);
    expect(system).toMatch(/solo con el resumen/i);
  });

  test("RF-7, RF-8: it asks to name the types with 10 packs or less and the missing eggs", () => {
    expect(system).toContain("10 packs o menos");
    expect(system).toMatch(/faltan/i);
  });

  test("RF-11: it asks not to say hoy nor ayer", () => {
    expect(system).toContain('"hoy"');
    expect(system).toContain('"ayer"');
  });

  test("RF-9: a quiet day says there was no movement, with no list to invent from", () => {
    const quiet = summaryPrompt(QUIET);
    expect(quiet.user).toContain("Sin ventas en la semana");
    expect(quiet.user).toContain("Tipos con 10 packs o menos: ninguno");
    expect(quiet.user).toContain("Faltantes para los pedidos en curso: ninguno");
    expect(quiet.system).toMatch(/sin inventar/i);
  });
});

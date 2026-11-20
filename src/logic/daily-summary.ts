// The "Resumen del día" of the admin Dashboard (spec 012). The base computes every number (spec 007);
// these choose and write the facts the AI receives (RF-6 to RF-10), decide which card to show with "now"
// in Buenos Aires (RF-12 to RF-14) and cut a long answer at its last complete sentence (RF-3, RF-4).
import type { DailyFacts } from "../../supabase/functions/daily-summary/prompt";
import { salesBars, type SalesRow } from "./admin-dashboard";
import { formatARS } from "./currency";
import { addDays, buenosAiresInstant, toBuenosAiresDate } from "./dates";
import { formatEggs, formatPacks } from "./stock";

export type { DailyFacts };

/** RF-7: 10 packs equivalent (spec 007: a pack is 180 eggs). */
const LOW_STOCK_EGGS = 1800;
/** RF-12: the summary of a day is made from 21:00 in Buenos Aires, when the last delivery slot ends. */
const CLOSING_TIME = "21:00";
/** RF-3 */
const MAX_SENTENCES = 3;
const MAX_CHARACTERS = 320;

/** What dailyFacts needs of admin_totals() and egg_type_overview (columns of a view may be null). */
type Totals = { income_today: number | null; delivered_today: number | null; to_deliver: number | null };
type StockRow = { name: string | null; active: boolean | null; stock: number | null; shortfall: number | null };

/** RF-6 to RF-10: the facts of the day, with nothing about clients. */
export function dailyFacts({
  totals,
  sales,
  stock,
}: {
  totals: Totals;
  sales: readonly SalesRow[];
  stock: readonly StockRow[];
}): DailyFacts {
  const week = salesBars(sales, "week");
  const active = stock.filter(
    (row): row is StockRow & { name: string; stock: number } => Boolean(row.active) && row.name !== null && row.stock !== null,
  );
  return {
    incomeToday: formatARS(totals.income_today ?? 0),
    deliveredToday: totals.delivered_today ?? 0,
    toDeliver: totals.to_deliver ?? 0,
    bestSellersWeek: week.kind === "bars" ? week.bars.filter((bar) => bar.best).map((bar) => bar.name) : [],
    lowStock: active
      .filter((row) => row.stock <= LOW_STOCK_EGGS)
      .map((row) => ({ type: row.name, packs: formatPacks(row.stock) })),
    shortfalls: active
      .filter((row) => (row.shortfall ?? 0) > 0)
      .map((row) => ({ type: row.name, eggs: formatEggs(row.shortfall ?? 0) })),
  };
}

/** A summary kept on the phone: its Buenos Aires day ("2026-11-19") and its text. */
export type StoredSummary = { date: string; text: string };

export type SummaryCardState =
  | { kind: "today"; text: string }
  | { kind: "yesterday"; text: string }
  | { kind: "due" }
  | { kind: "waiting" };

/**
 * RF-12 to RF-14: from 21:00 of a Buenos Aires day, that day's summary ("today") or, without it, one to
 * make ("due"); before 21:00, the summary of the day before ("yesterday") or the notice ("waiting").
 */
export function summaryCardState(stored: StoredSummary | null, now: Date): SummaryCardState {
  const today = toBuenosAiresDate(now);
  if (now.getTime() >= buenosAiresInstant(today, CLOSING_TIME).getTime()) {
    return stored?.date === today ? { kind: "today", text: stored.text } : { kind: "due" };
  }
  return stored?.date === addDays(today, -1) ? { kind: "yesterday", text: stored.text } : { kind: "waiting" };
}

/**
 * RF-3, RF-4: the complete sentences that fit in 320 characters, three at most, or null when not even the
 * first one fits or there is nothing. A sentence ends with ".", "!" or "?" followed by a space or the end,
 * so the dot of "$63.000" does not end one.
 */
export function trimSummary(text: string): string | null {
  const sentences = text
    .trim()
    .replace(/\s+/g, " ")
    .replace(/([.!?]) /g, "$1\u0000")
    .split("\u0000")
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  let kept = "";
  for (const sentence of sentences.slice(0, MAX_SENTENCES)) {
    const next = kept ? `${kept} ${sentence}` : sentence;
    if (Array.from(next).length > MAX_CHARACTERS) break;
    kept = next;
  }
  return kept || null;
}

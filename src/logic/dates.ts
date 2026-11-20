// Calendar days are computed in Buenos Aires (UTC−3, no daylight saving time) with a fixed offset
// instead of Intl: the result must not depend on the phone's time zone or on the JS engine's
// time zone data. Nothing here reads the clock; "now" always comes in as a parameter.
const OFFSET_MS = -3 * 60 * 60 * 1000;

export type BuenosAiresDay = {
  year: number;
  /** 0 = January … 11 = December. */
  month: number;
  day: number;
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
};

function assertValidDate(value: unknown): asserts value is Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new TypeError(`Expected a valid Date, received ${String(value)}`);
  }
}

export function getBuenosAiresDay(instant: Date): BuenosAiresDay {
  assertValidDate(instant);
  // Shift the instant by the offset and read it with the UTC getters: they give the Buenos Aires wall clock.
  const shifted = new Date(instant.getTime() + OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
  };
}

export function isSameBuenosAiresDay(a: Date, b: Date): boolean {
  const dayA = getBuenosAiresDay(a);
  const dayB = getBuenosAiresDay(b);
  return dayA.year === dayB.year && dayA.month === dayB.month && dayA.day === dayB.day;
}

const DAYS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"] as const;
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"] as const;

// "sáb 19 sep", or "Hoy · sáb 19 sep" when `instant` is on the same Buenos Aires day as `now`. No year.
export function formatDay(instant: Date, now: Date): string {
  const { weekday, day, month } = getBuenosAiresDay(instant);
  const text = `${DAYS[weekday]} ${day} ${MONTHS[month]}`;
  return isSameBuenosAiresDay(instant, now) ? `Hoy · ${text}` : text;
}

// "09:07": the Buenos Aires time of an instant, for the stock history (spec 003, RF-23).
export function formatTime(instant: Date): string {
  assertValidDate(instant);
  const shifted = new Date(instant.getTime() + OFFSET_MS);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`;
}

// Calendar dates as the base writes them ("2026-11-16"), for the delivery days (spec 004, RF-2, RF-21).
const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad(value: number, length = 2): string {
  return String(value).padStart(length, "0");
}

function parseDateKey(dateKey: string): { year: number; month: number; day: number } {
  const match = DATE_KEY.exec(dateKey);
  if (!match) throw new TypeError(`Expected a date as YYYY-MM-DD, received ${dateKey}`);
  return { year: Number(match[1]), month: Number(match[2]) - 1, day: Number(match[3]) };
}

/** "2026-11-16": the Buenos Aires calendar date of an instant. */
export function toBuenosAiresDate(instant: Date): string {
  const { year, month, day } = getBuenosAiresDay(instant);
  return `${pad(year, 4)}-${pad(month + 1)}-${pad(day)}`;
}

/** The date `days` calendar days after `dateKey` (across months and years). */
export function addDays(dateKey: string, days: number): string {
  const { year, month, day } = parseDateKey(dateKey);
  const shifted = new Date(Date.UTC(year, month, day + days));
  return `${pad(shifted.getUTCFullYear(), 4)}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

/** "Hoy · lun 16 nov" or "mar 17 nov": a calendar date written as formatDay does. */
export function formatDayKey(dateKey: string, now: Date): string {
  const { year, month, day } = parseDateKey(dateKey);
  // Noon in Buenos Aires (15:00 UTC) is surely inside that Buenos Aires day.
  return formatDay(new Date(Date.UTC(year, month, day, 15)), now);
}

/** "vie 13 nov": a calendar date, never with "Hoy" (spec 005: the flags of the admin Home). */
export function formatDateKey(dateKey: string): string {
  const { year, month, day } = parseDateKey(dateKey);
  const weekday = new Date(Date.UTC(year, month, day)).getUTCDay();
  return `${DAYS[weekday]} ${day} ${MONTHS[month]}`;
}

export type DaySection<T> = { title: string; items: T[] };

/**
 * Items already sorted from the newest to the oldest, cut into the Buenos Aires days of `at`: "Hoy · jue
 * 19 nov", "Ayer · mié 18 nov" or "mar 10 nov" (spec 006, RF-18; spec 011, RF-11). "Hoy" and "Ayer" come
 * from `now`, so they are right again whenever the caller passes a new one (spec 011, RF-15).
 */
export function groupByBuenosAiresDay<T>(items: readonly T[], at: (item: T) => string, now: Date): DaySection<T>[] {
  const today = toBuenosAiresDate(now);
  const yesterday = addDays(today, -1);
  const sections: (DaySection<T> & { day: string })[] = [];
  for (const item of items) {
    const day = toBuenosAiresDate(new Date(at(item)));
    const last = sections[sections.length - 1];
    if (last?.day === day) {
      last.items.push(item);
      continue;
    }
    const date = formatDateKey(day);
    const title = day === today ? `Hoy · ${date}` : day === yesterday ? `Ayer · ${date}` : date;
    sections.push({ day, title, items: [item] });
  }
  return sections.map(({ title, items: dayItems }) => ({ title, items: dayItems }));
}

const TIME = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

/** The instant of a time of day ("11:00:00") on a calendar date, in Buenos Aires (spec 005, RF-25). */
export function buenosAiresInstant(dateKey: string, time: string): Date {
  const { year, month, day } = parseDateKey(dateKey);
  const match = TIME.exec(time);
  if (!match) throw new TypeError(`Expected a time as HH:MM or HH:MM:SS, received ${time}`);
  const wallClock = Date.UTC(year, month, day, Number(match[1]), Number(match[2]), Number(match[3] ?? 0));
  return new Date(wallClock - OFFSET_MS);
}

import {
  addDays,
  buenosAiresInstant,
  formatDateKey,
  formatDay,
  formatDayKey,
  formatTime,
  getBuenosAiresDay,
  groupByBuenosAiresDay,
  isSameBuenosAiresDay,
  toBuenosAiresDate,
} from "@/logic/dates";

// Buenos Aires midnight is 03:00 UTC (UTC−3, no daylight saving time).
// Weekdays: 0 = Sunday … 6 = Saturday. Months: 0 = January … 11 = December.

describe("getBuenosAiresDay returns the Buenos Aires calendar day (RF-10)", () => {
  test("a midday instant keeps its day", () => {
    expect(getBuenosAiresDay(new Date("2026-09-19T15:00:00Z"))).toEqual({
      year: 2026,
      month: 8,
      day: 19,
      weekday: 6,
    });
  });

  test("02:59:59.999 UTC is still the previous day", () => {
    expect(getBuenosAiresDay(new Date("2026-09-20T02:59:59.999Z"))).toEqual({
      year: 2026,
      month: 8,
      day: 19,
      weekday: 6,
    });
  });

  test("03:00:00 UTC is already the next day", () => {
    expect(getBuenosAiresDay(new Date("2026-09-20T03:00:00Z"))).toEqual({
      year: 2026,
      month: 8,
      day: 20,
      weekday: 0,
    });
  });

  test("00:00 UTC belongs to the previous Buenos Aires day", () => {
    expect(getBuenosAiresDay(new Date("2026-09-20T00:00:00Z"))).toEqual({
      year: 2026,
      month: 8,
      day: 19,
      weekday: 6,
    });
  });

  test("last day of the year: 31 Dec 23:59 in Buenos Aires", () => {
    expect(getBuenosAiresDay(new Date("2027-01-01T02:59:00Z"))).toEqual({
      year: 2026,
      month: 11,
      day: 31,
      weekday: 4,
    });
  });

  test("first day of the year: 1 Jan 00:00 in Buenos Aires", () => {
    expect(getBuenosAiresDay(new Date("2027-01-01T03:00:00Z"))).toEqual({
      year: 2027,
      month: 0,
      day: 1,
      weekday: 5,
    });
  });

  test("month change: 30 Sep 23:00 vs 1 Oct 00:00 in Buenos Aires", () => {
    expect(getBuenosAiresDay(new Date("2026-10-01T02:00:00Z"))).toEqual({
      year: 2026,
      month: 8,
      day: 30,
      weekday: 3,
    });
    expect(getBuenosAiresDay(new Date("2026-10-01T03:00:00Z"))).toEqual({
      year: 2026,
      month: 9,
      day: 1,
      weekday: 4,
    });
  });

  test("leap year: 29 Feb exists in 2028 and not in 2027", () => {
    expect(getBuenosAiresDay(new Date("2028-02-29T03:00:00Z"))).toMatchObject({
      year: 2028,
      month: 1,
      day: 29,
    });
    expect(getBuenosAiresDay(new Date("2028-03-01T02:59:59Z"))).toMatchObject({
      month: 1,
      day: 29,
    });
    expect(getBuenosAiresDay(new Date("2027-03-01T02:59:59Z"))).toMatchObject({
      month: 1,
      day: 28,
    });
  });

  test("an instant before 1970 works", () => {
    expect(getBuenosAiresDay(new Date(0))).toEqual({ year: 1969, month: 11, day: 31, weekday: 3 });
  });

  test("does not change the Date it receives", () => {
    const instant = new Date("2026-09-20T02:59:59Z");
    const before = instant.getTime();
    getBuenosAiresDay(instant);
    expect(instant.getTime()).toBe(before);
  });
});

describe("isSameBuenosAiresDay compares calendar days (RF-10)", () => {
  test("two instants on the same side of midnight are the same day", () => {
    expect(
      isSameBuenosAiresDay(new Date("2026-09-19T03:00:00Z"), new Date("2026-09-20T02:59:59.999Z")),
    ).toBe(true);
  });

  test("02:59:59 UTC and 03:00:00 UTC are different days", () => {
    expect(
      isSameBuenosAiresDay(new Date("2026-09-20T02:59:59Z"), new Date("2026-09-20T03:00:00Z")),
    ).toBe(false);
  });

  test("the same UTC day can be two Buenos Aires days", () => {
    expect(
      isSameBuenosAiresDay(new Date("2026-09-19T01:00:00Z"), new Date("2026-09-19T04:00:00Z")),
    ).toBe(false);
  });

  test("different UTC days can be the same Buenos Aires day", () => {
    expect(
      isSameBuenosAiresDay(new Date("2026-09-19T15:00:00Z"), new Date("2026-09-20T01:00:00Z")),
    ).toBe(true);
  });

  test("31 Dec 23:59 and 1 Jan 00:00 are different days", () => {
    expect(
      isSameBuenosAiresDay(new Date("2027-01-01T02:59:00Z"), new Date("2027-01-01T03:00:00Z")),
    ).toBe(false);
  });

  test("the same day of the month in a different month is a different day", () => {
    expect(
      isSameBuenosAiresDay(new Date("2026-09-19T15:00:00Z"), new Date("2026-10-19T15:00:00Z")),
    ).toBe(false);
  });

  test("the same day and month in a different year is a different day", () => {
    expect(
      isSameBuenosAiresDay(new Date("2026-09-19T15:00:00Z"), new Date("2027-09-19T15:00:00Z")),
    ).toBe(false);
  });

  test("an instant is the same day as itself, and the order does not matter", () => {
    const a = new Date("2026-09-19T15:00:00Z");
    const b = new Date("2026-09-20T03:00:00Z");
    expect(isSameBuenosAiresDay(a, a)).toBe(true);
    expect(isSameBuenosAiresDay(a, b)).toBe(isSameBuenosAiresDay(b, a));
  });
});

describe("rejects anything that is not a valid Date (RF-11)", () => {
  const notDates: [string, unknown][] = [
    ["an invalid Date", new Date(NaN)],
    ["a Date from unparseable text", new Date("not a date")],
    ["null", null],
    ["undefined", undefined],
    ["a timestamp number", 1_790_000_000_000],
    ["an ISO string", "2026-09-19T15:00:00Z"],
    ["an object", {}],
  ];

  test.each(notDates)("getBuenosAiresDay throws a TypeError for %s", (_label, value) => {
    expect(() => getBuenosAiresDay(value as Date)).toThrow(TypeError);
  });

  test.each(notDates)("isSameBuenosAiresDay throws a TypeError for %s as the first argument", (_label, value) => {
    expect(() => isSameBuenosAiresDay(value as Date, new Date("2026-09-19T15:00:00Z"))).toThrow(TypeError);
  });

  test.each(notDates)("isSameBuenosAiresDay throws a TypeError for %s as the second argument", (_label, value) => {
    expect(() => isSameBuenosAiresDay(new Date("2026-09-19T15:00:00Z"), value as Date)).toThrow(TypeError);
  });
});

describe("formatDay writes the day as `<day> <number> <month>` (RF-9)", () => {
  // A "now" far from every instant below, so none of these cases gets the `Hoy · ` prefix.
  const farNow = new Date("2020-01-01T15:00:00Z");

  test("the spec example", () => {
    expect(formatDay(new Date("2026-09-19T15:00:00Z"), new Date("2026-09-19T20:00:00Z"))).toBe("Hoy · sáb 19 sep");
    expect(formatDay(new Date("2026-09-19T15:00:00Z"), farNow)).toBe("sáb 19 sep");
  });

  test.each([
    ["2026-09-20T15:00:00Z", "dom 20 sep"],
    ["2026-09-21T15:00:00Z", "lun 21 sep"],
    ["2026-09-22T15:00:00Z", "mar 22 sep"],
    ["2026-09-23T15:00:00Z", "mié 23 sep"],
    ["2026-09-24T15:00:00Z", "jue 24 sep"],
    ["2026-09-25T15:00:00Z", "vie 25 sep"],
    ["2026-09-26T15:00:00Z", "sáb 26 sep"],
  ])("weekday names: %s → %s", (iso, expected) => {
    expect(formatDay(new Date(iso), farNow)).toBe(expected);
  });

  test.each([
    ["2026-01-15T15:00:00Z", "jue 15 ene"],
    ["2026-02-15T15:00:00Z", "dom 15 feb"],
    ["2026-03-15T15:00:00Z", "dom 15 mar"],
    ["2026-04-15T15:00:00Z", "mié 15 abr"],
    ["2026-05-15T15:00:00Z", "vie 15 may"],
    ["2026-06-15T15:00:00Z", "lun 15 jun"],
    ["2026-07-15T15:00:00Z", "mié 15 jul"],
    ["2026-08-15T15:00:00Z", "sáb 15 ago"],
    ["2026-09-15T15:00:00Z", "mar 15 sep"],
    ["2026-10-15T15:00:00Z", "jue 15 oct"],
    ["2026-11-15T15:00:00Z", "dom 15 nov"],
    ["2026-12-15T15:00:00Z", "mar 15 dic"],
  ])("month names: %s → %s", (iso, expected) => {
    expect(formatDay(new Date(iso), farNow)).toBe(expected);
  });

  test("single-digit days have no leading zero", () => {
    expect(formatDay(new Date("2026-09-05T15:00:00Z"), farNow)).toBe("sáb 5 sep");
  });

  test("everything is lowercase, with no trailing period and no year", () => {
    const text = formatDay(new Date("2026-09-19T15:00:00Z"), farNow);
    expect(text).toBe(text.toLowerCase());
    expect(text).not.toMatch(/\./);
    expect(text).not.toMatch(/\d{4}/);
  });

  test("uses the Buenos Aires day, not the UTC day", () => {
    expect(formatDay(new Date("2026-09-20T02:59:59Z"), farNow)).toBe("sáb 19 sep");
    expect(formatDay(new Date("2026-09-20T03:00:00Z"), farNow)).toBe("dom 20 sep");
  });

  test("last and first day of the year", () => {
    expect(formatDay(new Date("2027-01-01T02:59:00Z"), farNow)).toBe("jue 31 dic");
    expect(formatDay(new Date("2027-01-01T03:00:00Z"), farNow)).toBe("vie 1 ene");
  });
});

describe("formatDay adds `Hoy · ` only on the same Buenos Aires day (RF-9, RF-10)", () => {
  const now = new Date("2026-09-19T20:00:00Z");

  test("same day, different time", () => {
    expect(formatDay(new Date("2026-09-19T03:00:00Z"), now)).toBe("Hoy · sáb 19 sep");
    expect(formatDay(new Date("2026-09-20T02:59:59.999Z"), now)).toBe("Hoy · sáb 19 sep");
  });

  test("the instant just before and just after midnight have no prefix", () => {
    expect(formatDay(new Date("2026-09-19T02:59:59.999Z"), now)).toBe("vie 18 sep");
    expect(formatDay(new Date("2026-09-20T03:00:00Z"), now)).toBe("dom 20 sep");
  });

  test("the prefix follows the Buenos Aires day of `now` too", () => {
    const justAfterMidnight = new Date("2026-09-20T03:00:00Z");
    expect(formatDay(new Date("2026-09-20T15:00:00Z"), justAfterMidnight)).toBe("Hoy · dom 20 sep");
    expect(formatDay(new Date("2026-09-19T15:00:00Z"), justAfterMidnight)).toBe("sáb 19 sep");
  });

  test("a future instant has no prefix and no year", () => {
    expect(formatDay(new Date("2026-09-25T15:00:00Z"), now)).toBe("vie 25 sep");
  });

  test("a past instant has no prefix and no year", () => {
    expect(formatDay(new Date("2026-09-12T15:00:00Z"), now)).toBe("sáb 12 sep");
  });

  test("the same day and month in another year has no prefix and no year", () => {
    expect(formatDay(new Date("2025-09-19T15:00:00Z"), now)).toBe("vie 19 sep");
    expect(formatDay(new Date("2027-09-19T15:00:00Z"), now)).toBe("dom 19 sep");
  });

  test("the same day number in another month has no prefix", () => {
    expect(formatDay(new Date("2026-10-19T15:00:00Z"), now)).toBe("lun 19 oct");
  });

  test("a month or year change between now and the instant has no prefix", () => {
    const newYearsEve = new Date("2026-12-31T20:00:00Z");
    expect(formatDay(new Date("2027-01-01T15:00:00Z"), newYearsEve)).toBe("vie 1 ene");
  });

  test("does not read the system clock", () => {
    jest.useFakeTimers();
    try {
      jest.setSystemTime(new Date("2026-09-19T20:00:00Z"));
      const withClockOnTheSameDay = formatDay(new Date("2026-09-25T15:00:00Z"), new Date("2020-01-01T15:00:00Z"));
      jest.setSystemTime(new Date("2026-09-25T20:00:00Z"));
      const withClockOnTheInstantDay = formatDay(new Date("2026-09-25T15:00:00Z"), new Date("2020-01-01T15:00:00Z"));
      expect(withClockOnTheSameDay).toBe("vie 25 sep");
      expect(withClockOnTheInstantDay).toBe("vie 25 sep");
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("formatDay rejects an invalid instant or `now` (RF-11)", () => {
  const valid = new Date("2026-09-19T15:00:00Z");
  const notDates: [string, unknown][] = [
    ["an invalid Date", new Date(NaN)],
    ["null", null],
    ["undefined", undefined],
    ["a timestamp number", 1_790_000_000_000],
    ["an ISO string", "2026-09-19T15:00:00Z"],
  ];

  test.each(notDates)("throws for %s as the instant", (_label, value) => {
    expect(() => formatDay(value as Date, valid)).toThrow(/valid Date/);
  });

  test.each(notDates)("throws for %s as now", (_label, value) => {
    expect(() => formatDay(valid, value as Date)).toThrow(/valid Date/);
  });

  test("throws a TypeError when both are invalid", () => {
    expect(() => formatDay(new Date(NaN), new Date(NaN))).toThrow(/valid Date/);
  });
});

describe("formatTime writes the Buenos Aires time as HH:MM (spec 003, RF-23)", () => {
  test.each([
    ["2026-09-19T15:00:00Z", "12:00"],
    ["2026-09-19T03:00:00Z", "00:00"],
    ["2026-09-20T02:59:59.999Z", "23:59"],
    ["2026-09-19T12:07:30Z", "09:07"],
  ])("%s → %s", (iso, expected) => {
    expect(formatTime(new Date(iso))).toBe(expected);
  });

  test("throws for an invalid instant", () => {
    expect(() => formatTime(new Date(NaN))).toThrow(/valid Date/);
  });
});

// Spec 004 · T6: calendar dates as the base writes them, for the delivery days (RF-2, RF-21).
describe("toBuenosAiresDate", () => {
  test.each([
    ["2026-11-16T15:00:00Z", "2026-11-16"],
    ["2026-11-17T02:59:59.999Z", "2026-11-16"],
    ["2026-11-17T03:00:00Z", "2026-11-17"],
    ["2027-01-01T02:00:00Z", "2026-12-31"],
  ])("%s → %s", (iso, date) => {
    expect(toBuenosAiresDate(new Date(iso))).toBe(date);
  });

  test("does not depend on the time zone of the process", () => {
    const original = process.env.TZ;
    try {
      process.env.TZ = "Asia/Tokyo";
      expect(toBuenosAiresDate(new Date("2026-11-17T02:59:00Z"))).toBe("2026-11-16");
    } finally {
      process.env.TZ = original;
    }
  });

  test("throws for an invalid instant", () => {
    expect(() => toBuenosAiresDate(new Date(NaN))).toThrow(/valid Date/);
  });
});

describe("addDays", () => {
  test.each([
    ["2026-11-16", 1, "2026-11-17"],
    ["2026-11-30", 1, "2026-12-01"],
    ["2026-12-31", 1, "2027-01-01"],
    ["2028-02-28", 1, "2028-02-29"],
    ["2026-11-16", 6, "2026-11-22"],
    ["2026-11-16", 0, "2026-11-16"],
  ])("%s + %d → %s", (date, days, expected) => {
    expect(addDays(date, days)).toBe(expected);
  });

  test("throws for something that is not a date", () => {
    expect(() => addDays("16/11/2026", 1)).toThrow(/YYYY-MM-DD/);
  });
});

describe("formatDayKey", () => {
  const now = new Date("2026-11-16T12:00:00Z"); // Monday 16, 09:00 in Buenos Aires

  test.each([
    ["2026-11-16", "Hoy · lun 16 nov"],
    ["2026-11-17", "mar 17 nov"],
    ["2026-11-22", "dom 22 nov"],
    ["2026-12-01", "mar 1 dic"],
  ])("%s → %j", (date, text) => {
    expect(formatDayKey(date, now)).toBe(text);
  });

  test("at 23:59 in Buenos Aires today is still the same day", () => {
    expect(formatDayKey("2026-11-16", new Date("2026-11-17T02:59:00Z"))).toBe("Hoy · lun 16 nov");
  });
});

// Spec 005 · T4: a calendar date without "Hoy" and the instant of a time of day, for the flags of the
// admin Home (RF-25).
describe("formatDateKey", () => {
  test.each([
    ["2026-11-13", "vie 13 nov"],
    ["2026-11-09", "lun 9 nov"],
    ["2027-01-01", "vie 1 ene"],
  ])("%s → %j (never with Hoy)", (date, text) => {
    expect(formatDateKey(date)).toBe(text);
  });
});

describe("buenosAiresInstant", () => {
  test.each([
    ["2026-11-13", "11:00:00", "2026-11-13T14:00:00.000Z"],
    ["2026-11-13", "21:00:00", "2026-11-14T00:00:00.000Z"],
    ["2026-12-31", "22:30:00", "2027-01-01T01:30:00.000Z"],
  ])("%s %s in Buenos Aires → %s", (date, time, iso) => {
    expect(buenosAiresInstant(date, time).toISOString()).toBe(iso);
  });

  test("throws for a time that is not HH:MM or HH:MM:SS", () => {
    expect(() => buenosAiresInstant("2026-11-13", "9 h")).toThrow(/HH:MM/);
  });
});

describe("groupByBuenosAiresDay (spec 011, RF-11, RF-15)", () => {
  // Thursday 19 Nov 2026, 12:00 in Buenos Aires.
  const NOW = new Date("2026-11-19T15:00:00Z");
  const at = (item: { at: string }) => item.at;

  it("cuts the items into Buenos Aires days titled Hoy, Ayer or the date, in the order received", () => {
    const today = { id: 1, at: "2026-11-19T14:00:00Z" };
    // 23:30 of Wednesday in Buenos Aires, already Thursday in UTC.
    const lateYesterday = { id: 2, at: "2026-11-19T02:30:00Z" };
    const yesterday = { id: 3, at: "2026-11-18T12:00:00Z" };
    const older = { id: 4, at: "2026-11-10T12:00:00Z" };

    expect(groupByBuenosAiresDay([today, lateYesterday, yesterday, older], at, NOW)).toEqual([
      { title: "Hoy · jue 19 nov", items: [today] },
      { title: "Ayer · mié 18 nov", items: [lateYesterday, yesterday] },
      { title: "mar 10 nov", items: [older] },
    ]);
  });

  it("does not reorder the items inside a day", () => {
    const first = { id: 1, at: "2026-11-19T10:00:00Z" };
    const second = { id: 2, at: "2026-11-19T14:00:00Z" };
    expect(groupByBuenosAiresDay([first, second], at, NOW)).toEqual([{ title: "Hoy · jue 19 nov", items: [first, second] }]);
  });

  it("recomputes Hoy and Ayer from the `now` it receives", () => {
    const item = { id: 1, at: "2026-11-19T14:00:00Z" };
    // Friday 20 Nov, 00:10 in Buenos Aires: the same item is now from yesterday.
    expect(groupByBuenosAiresDay([item], at, new Date("2026-11-20T03:10:00Z"))).toEqual([
      { title: "Ayer · jue 19 nov", items: [item] },
    ]);
  });

  it("returns no days for no items", () => {
    expect(groupByBuenosAiresDay([], at, NOW)).toEqual([]);
  });
});

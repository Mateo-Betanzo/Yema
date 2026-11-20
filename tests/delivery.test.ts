import { deliveryDays, formatSlot, groupSlotsByDay, type DeliveryOption } from "@/logic/delivery";

// Spec 004 · T6: the delivery days and slots of the checkout (RF-2, RF-3, RF-21). The base decides which
// slots are offered (delivery_options); these only lay them out by day. Buenos Aires midnight is 03:00
// UTC (UTC−3, no daylight saving time).

describe("deliveryDays (RF-2)", () => {
  test("today and the next 6 days in Buenos Aires", () => {
    expect(deliveryDays(new Date("2026-11-16T12:00:00Z"))).toEqual([
      "2026-11-16",
      "2026-11-17",
      "2026-11-18",
      "2026-11-19",
      "2026-11-20",
      "2026-11-21",
      "2026-11-22",
    ]);
  });

  test("the days change at midnight in Buenos Aires, not in UTC", () => {
    expect(deliveryDays(new Date("2026-11-17T02:59:00Z"))[0]).toBe("2026-11-16");
    expect(deliveryDays(new Date("2026-11-17T03:00:00Z"))[0]).toBe("2026-11-17");
  });

  test("crosses the end of the month and of the year", () => {
    expect(deliveryDays(new Date("2026-12-29T15:00:00Z"))).toEqual([
      "2026-12-29",
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
      "2027-01-03",
      "2027-01-04",
    ]);
  });
});

describe("formatSlot", () => {
  test.each([
    ["09:00:00", "11:00:00", "9 a 11 h"],
    ["18:00:00", "21:00:00", "18 a 21 h"],
    ["09:30:00", "11:00:00", "9:30 a 11 h"],
    ["08:00:00", "12:15:00", "8 a 12:15 h"],
  ])("%s – %s → %j", (starts, ends, text) => {
    expect(formatSlot(starts, ends)).toBe(text);
  });
});

describe("groupSlotsByDay (RF-3, RF-21)", () => {
  const option = (date: string, id: number, starts: string, ends: string, full = false): DeliveryOption => ({
    delivery_date: date,
    slot_id: id,
    starts_at: starts,
    ends_at: ends,
    is_full: full,
  });
  const days = ["2026-11-16", "2026-11-17", "2026-11-22"];

  test("each day with its slots in order, and the full ones marked", () => {
    const options = [
      option("2026-11-16", 2, "18:00:00", "21:00:00", true),
      option("2026-11-17", 3, "09:00:00", "11:00:00"),
      option("2026-11-17", 4, "18:00:00", "21:00:00"),
    ];
    expect(groupSlotsByDay(days, options)).toEqual([
      { date: "2026-11-16", slots: [{ id: 2, label: "18 a 21 h", full: true }], hasChoice: false },
      {
        date: "2026-11-17",
        slots: [
          { id: 3, label: "9 a 11 h", full: false },
          { id: 4, label: "18 a 21 h", full: false },
        ],
        hasChoice: true,
      },
      { date: "2026-11-22", slots: [], hasChoice: false },
    ]);
  });

  test("RF-21: a day without slots, or with all of them full, has nothing to choose", () => {
    const groups = groupSlotsByDay(days, [option("2026-11-16", 1, "09:00:00", "11:00:00", true)]);
    expect(groups.map((group) => group.hasChoice)).toEqual([false, false, false]);
  });

  test("options outside the delivery days are left out", () => {
    const groups = groupSlotsByDay(["2026-11-16"], [option("2026-11-30", 1, "09:00:00", "11:00:00")]);
    expect(groups).toEqual([{ date: "2026-11-16", slots: [], hasChoice: false }]);
  });

  test("slots come sorted by time even if the options are not", () => {
    const groups = groupSlotsByDay(
      ["2026-11-17"],
      [option("2026-11-17", 4, "18:00:00", "21:00:00"), option("2026-11-17", 3, "09:00:00", "11:00:00")],
    );
    expect(groups[0].slots.map((slot) => slot.id)).toEqual([3, 4]);
  });
});

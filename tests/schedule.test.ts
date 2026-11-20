import {
  activeOrdersText,
  HALF_HOURS,
  hourLabel,
  scheduleDays,
  slotChangeNeedsWarning,
  slotErrorMessage,
  slotDeletionName,
  slotName,
  slotProblem,
  slotToggle,
  WEEK,
  type ScheduleSlot,
} from "@/logic/schedule";

// Spec 009 · T2: the schedule of the admin (RF-2, RF-3, RF-6 to RF-9, RF-13, RF-16). The base keeps
// every rule (T1); these show the schedule and say what is wrong before saving, with names.
let nextId = 1;
const slot = (fields: Partial<ScheduleSlot> = {}): ScheduleSlot => ({
  id: nextId++,
  weekday: 1,
  starts_at: "09:00:00",
  ends_at: "11:00:00",
  capacity: 5,
  active: true,
  active_orders: 0,
  ...fields,
});

describe("WEEK and HALF_HOURS", () => {
  test("RF-2: the days from Monday to Sunday, with the weekday of the base (0 = Sunday)", () => {
    expect(WEEK.map((day) => [day.weekday, day.name])).toEqual([
      [1, "Lunes"],
      [2, "Martes"],
      [3, "Miércoles"],
      [4, "Jueves"],
      [5, "Viernes"],
      [6, "Sábado"],
      [0, "Domingo"],
    ]);
  });

  test("RF-6: every half hour from 6:00 to 23:00", () => {
    expect(HALF_HOURS[0]).toBe("06:00");
    expect(HALF_HOURS[1]).toBe("06:30");
    expect(HALF_HOURS[HALF_HOURS.length - 1]).toBe("23:00");
    expect(HALF_HOURS).toHaveLength(35);
  });
});

describe("hourLabel (RF-6)", () => {
  test("the chip of an hour, with its minutes", () => {
    expect(hourLabel("06:00")).toBe("6:00");
    expect(hourLabel("09:30:00")).toBe("9:30");
    expect(hourLabel("23:00")).toBe("23:00");
  });
});

describe("scheduleDays (RF-2, RF-3)", () => {
  test("the seven days, each with its slots from the earliest; a day without slots has none", () => {
    const late = slot({ weekday: 1, starts_at: "18:00:00", ends_at: "21:00:00" });
    const early = slot({ weekday: 1 });
    const sunday = slot({ weekday: 0, active: false });
    const days = scheduleDays([late, sunday, early]);
    expect(days.map((day) => day.name)).toEqual(["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]);
    expect(days[0].slots).toEqual([early, late]);
    expect(days[1].slots).toEqual([]);
    expect(days[6].slots).toEqual([sunday]);
  });
});

describe("slotProblem", () => {
  const monday = slot({ weekday: 1, starts_at: "09:00:00", ends_at: "11:00:00" });
  const inactive = slot({ weekday: 1, starts_at: "18:00:00", ends_at: "21:00:00", active: false });
  const slots = [monday, inactive];
  const candidate = { weekday: 1, starts_at: "14:00", ends_at: "16:00", active: true };

  test("a slot that fits has no problem", () => {
    expect(slotProblem(candidate, slots)).toBeNull();
  });

  test("RF-7: it has to end after it starts", () => {
    expect(slotProblem({ ...candidate, ends_at: "14:00" }, slots)).toBe("El horario tiene que terminar después de empezar");
    expect(slotProblem({ ...candidate, ends_at: "13:30" }, slots)).toBe("El horario tiene que terminar después de empezar");
  });

  test("RF-8: an active slot cannot overlap another active one of the same day, which it names", () => {
    expect(slotProblem({ ...candidate, starts_at: "10:00", ends_at: "12:00" }, slots)).toBe("Se superpone con 9 a 11 h");
    expect(slotProblem({ ...candidate, starts_at: "08:00", ends_at: "09:30" }, slots)).toBe("Se superpone con 9 a 11 h");
  });

  test("RF-8: touching is not overlapping, nor is another day or an inactive slot", () => {
    expect(slotProblem({ ...candidate, starts_at: "11:00", ends_at: "13:00" }, slots)).toBeNull();
    expect(slotProblem({ ...candidate, weekday: 2, starts_at: "10:00", ends_at: "12:00" }, slots)).toBeNull();
    expect(slotProblem({ ...candidate, starts_at: "19:00", ends_at: "20:00" }, slots)).toBeNull();
    expect(slotProblem({ ...candidate, starts_at: "10:00", ends_at: "12:00", active: false }, slots)).toBeNull();
  });

  test("RF-8: a slot being edited does not overlap itself", () => {
    expect(slotProblem({ ...candidate, id: monday.id, starts_at: "09:30", ends_at: "11:30" }, slots)).toBeNull();
  });

  test("RF-9: creating one with the start of an inactive slot of the same day says to edit that one", () => {
    expect(slotProblem({ ...candidate, starts_at: "18:00", ends_at: "19:00" }, slots)).toBe(
      "Ya hay una franja inactiva el lunes a las 18:00. Editala y activala.",
    );
    expect(slotProblem({ ...candidate, weekday: 0, starts_at: "09:30", ends_at: "11:00" }, [slot({ weekday: 0, starts_at: "09:30:00", active: false })])).toBe(
      "Ya hay una franja inactiva el domingo a las 9:30. Editala y activala.",
    );
  });

  test("RF-9: editing that inactive slot itself is fine", () => {
    expect(slotProblem({ ...candidate, id: inactive.id, starts_at: "18:00", ends_at: "20:00", active: false }, slots)).toBeNull();
  });
});

describe("slotChangeNeedsWarning and activeOrdersText (RF-13)", () => {
  const busy = slot({ active_orders: 3 });
  const same = { starts_at: "09:00", ends_at: "11:00", capacity: 5, active: true };

  test("with orders in progress, a change of hours or capacity, or turning it off, needs a warning", () => {
    expect(slotChangeNeedsWarning(busy, { ...same, starts_at: "09:30" })).toBe(true);
    expect(slotChangeNeedsWarning(busy, { ...same, ends_at: "12:00" })).toBe(true);
    expect(slotChangeNeedsWarning(busy, { ...same, capacity: 2 })).toBe(true);
    expect(slotChangeNeedsWarning(busy, { ...same, active: false })).toBe(true);
  });

  test("no warning without orders in progress, without changes, or when turning it on", () => {
    expect(slotChangeNeedsWarning(slot({ active_orders: 0 }), { ...same, capacity: 2 })).toBe(false);
    expect(slotChangeNeedsWarning(slot({ active_orders: null }), { ...same, capacity: 2 })).toBe(false);
    expect(slotChangeNeedsWarning(busy, same)).toBe(false);
    expect(slotChangeNeedsWarning(slot({ active: false, active_orders: 3 }), same)).toBe(false);
  });

  test("the warning counts the orders", () => {
    expect(activeOrdersText(3)).toBe("Esta franja tiene 3 pedidos en curso: siguen como están");
    expect(activeOrdersText(1)).toBe("Esta franja tiene 1 pedido en curso: sigue como está");
  });
});

describe("slotErrorMessage (RF-8, RF-9, RF-16)", () => {
  const pg = (code: string, message: string) => ({ code, message, details: null, hint: null });
  test.each([
    [pg("23P01", 'conflicting key value violates exclusion constraint "delivery_slots_no_overlap"'), "Se superpone con otra franja activa del mismo día"],
    [pg("23505", 'duplicate key value violates unique constraint "delivery_slots_weekday_start_key"'), "Ya hay una franja ese día a esa hora"],
    [pg("23514", 'new row violates check constraint "delivery_slots_half_hours"'), "Revisá el horario y el cupo"],
    [pg("", "TypeError: Network request failed"), "No hay conexión. Revisá tu internet e intentá de nuevo"],
    [pg("42501", "permission denied"), "No pudimos guardar. Intentá de nuevo"],
    [new Error("boom"), "No pudimos guardar. Intentá de nuevo"],
  ])("%o → %s", (error, text) => {
    expect(slotErrorMessage(error)).toBe(text);
  });
});

// Spec 009, cambio del 2026-11-19 · T8: the menu of each slot (RF-19, RF-20, RF-22, RF-27).
describe("slotName (RF-20, RF-27)", () => {
  test("the day in lowercase and the hours, as the menu label and the deletion question say them", () => {
    expect(slotName(slot({ weekday: 1, starts_at: "09:00:00", ends_at: "11:00:00" }))).toBe("lunes 9 a 11 h");
    expect(slotName(slot({ weekday: 0, starts_at: "18:30:00", ends_at: "21:00:00" }))).toBe("domingo 18:30 a 21 h");
  });
});

describe("slotDeletionName (RF-20)", () => {
  test("names the slot as the deletion question says it", () => {
    expect(slotDeletionName(slot({ weekday: 3, starts_at: "09:00:00", ends_at: "11:00:00" }))).toBe(
      "la franja del miércoles de 9 a 11 h",
    );
  });
});

describe("slotToggle (RF-19)", () => {
  test("turning off a slot without orders in progress saves it", () => {
    const monday = slot({ active: true, active_orders: 0 });
    expect(slotToggle(monday, [monday])).toEqual({ kind: "save" });
  });

  test("turning off a slot with orders in progress asks first, with the text of RF-13", () => {
    const monday = slot({ active: true, active_orders: 3 });
    expect(slotToggle(monday, [monday])).toEqual({ kind: "confirm", message: activeOrdersText(3) });
  });

  test("turning on a slot that overlaps nobody saves it", () => {
    const morning = slot({ starts_at: "09:00:00", ends_at: "11:00:00", active: false });
    const noon = slot({ starts_at: "11:00:00", ends_at: "13:00:00", active: true });
    expect(slotToggle(morning, [morning, noon])).toEqual({ kind: "save" });
  });

  test("turning on a slot that overlaps an active one of the same day is blocked, naming it (RF-8)", () => {
    const morning = slot({ starts_at: "09:00:00", ends_at: "11:00:00", active: false });
    const overlapping = slot({ starts_at: "10:00:00", ends_at: "12:00:00", active: true });
    const otherDay = slot({ weekday: 2, starts_at: "09:00:00", ends_at: "11:00:00", active: true });
    expect(slotToggle(morning, [morning, overlapping, otherDay])).toEqual({
      kind: "blocked",
      message: "Se superpone con 10 a 12 h",
    });
  });
});

describe("slotErrorMessage, cambio del 2026-11-19 (RF-22)", () => {
  const pg = (code: string, message: string, hint: string | null = null) => ({ code, message, details: null, hint });
  test.each([
    [pg("P0001", "slot_has_active_orders", "3"), "Tiene 3 pedidos en curso"],
    [pg("P0001", "slot_has_active_orders", "1"), "Tiene 1 pedido en curso"],
    [pg("P0002", "slot_not_found"), "Esa franja ya no existe"],
  ])("%o → %s", (error, text) => {
    expect(slotErrorMessage(error)).toBe(text);
  });
});

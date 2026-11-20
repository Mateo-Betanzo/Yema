// The delivery schedule of the admin (spec 009: RF-2, RF-3, RF-6 to RF-9, RF-13, RF-16; cambio del
// 2026-11-19: RF-19, RF-20, RF-22, RF-27). The base keeps
// every rule of a slot (checks, the exclusion of overlapping active slots, column grants); these show
// the schedule and say, with names, what would stop a save before it is sent.
import { isPostgresError } from "./catalog-errors";
import { formatSlot } from "./delivery";
import { NO_CONNECTION } from "./form-rules";

/** A row of delivery_slot_overview. */
export type ScheduleSlot = {
  id: number;
  weekday: number;
  /** "09:00:00" */
  starts_at: string;
  ends_at: string;
  capacity: number;
  active: boolean;
  /** Pending, accepted and on the way orders of the slot, of any day. */
  active_orders: number | null;
};

/** RF-2: the week from Monday, with the weekday of the base (extract(dow): 0 = Sunday). */
export const WEEK = [
  { weekday: 1, name: "Lunes" },
  { weekday: 2, name: "Martes" },
  { weekday: 3, name: "Miércoles" },
  { weekday: 4, name: "Jueves" },
  { weekday: 5, name: "Viernes" },
  { weekday: 6, name: "Sábado" },
  { weekday: 0, name: "Domingo" },
] as const;

/** RF-6: every hour and half hour from 6:00 to 23:00 ("06:00" … "23:00"). */
export const HALF_HOURS: readonly string[] = Array.from({ length: 35 }, (_, index) => {
  const minutes = 6 * 60 + index * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${minutes % 60 === 0 ? "00" : "30"}`;
});

/** Minutes of the day of "09:30" or "09:30:00". */
function minutes(time: string): number {
  const [hours, mins] = time.split(":");
  return Number(hours) * 60 + Number(mins);
}

/** RF-2, RF-3: the seven days, each with its slots from the earliest. */
export function scheduleDays<S extends ScheduleSlot>(slots: readonly S[]) {
  return WEEK.map((day) => ({
    ...day,
    slots: slots
      .filter((slot) => slot.weekday === day.weekday)
      .sort((a, b) => minutes(a.starts_at) - minutes(b.starts_at)),
  }));
}

/** The slot being saved: with its id when it is edited. */
export type SlotCandidate = { id?: number; weekday: number; starts_at: string; ends_at: string; active: boolean };

function dayName(weekday: number): string {
  return (WEEK.find((day) => day.weekday === weekday)?.name ?? "").toLowerCase();
}

/** RF-6: an hour as its chip reads it: "9:00", "18:30" (also from "09:30:00"). */
export function hourLabel(time: string): string {
  const [hours, mins] = time.split(":");
  return `${Number(hours)}:${mins}`;
}

/**
 * RF-7 to RF-9: what stops a slot from being saved, or null. It must end after it starts; an active
 * slot cannot share a moment with another active one of the same day (touching is fine); and a new
 * slot cannot start when an inactive one of the same day does, which is to be edited instead.
 */
export function slotProblem(candidate: SlotCandidate, slots: readonly ScheduleSlot[]): string | null {
  const start = minutes(candidate.starts_at);
  const end = minutes(candidate.ends_at);
  if (end <= start) return "El horario tiene que terminar después de empezar";
  const sameDay = slots.filter((slot) => slot.weekday === candidate.weekday && slot.id !== candidate.id);
  if (candidate.active) {
    const overlapped = sameDay.find(
      (slot) => slot.active && minutes(slot.starts_at) < end && start < minutes(slot.ends_at),
    );
    if (overlapped) return `Se superpone con ${formatSlot(overlapped.starts_at, overlapped.ends_at)}`;
  }
  if (candidate.id === undefined) {
    const twin = sameDay.find((slot) => !slot.active && minutes(slot.starts_at) === start);
    if (twin) {
      return `Ya hay una franja inactiva el ${dayName(candidate.weekday)} a las ${hourLabel(twin.starts_at)}. Editala y activala.`;
    }
  }
  return null;
}

export type SlotChange = { starts_at: string; ends_at: string; capacity: number; active: boolean };

/** RF-13: a change that touches a slot with orders in progress: its hours, its capacity, or turning it off. */
export function slotChangeNeedsWarning(before: ScheduleSlot, after: SlotChange): boolean {
  if ((before.active_orders ?? 0) === 0) return false;
  return (
    minutes(before.starts_at) !== minutes(after.starts_at) ||
    minutes(before.ends_at) !== minutes(after.ends_at) ||
    before.capacity !== after.capacity ||
    (before.active && !after.active)
  );
}

/** RF-13: "Esta franja tiene 3 pedidos en curso: siguen como están". */
export function activeOrdersText(count: number): string {
  return count === 1
    ? "Esta franja tiene 1 pedido en curso: sigue como está"
    : `Esta franja tiene ${count} pedidos en curso: siguen como están`;
}

/**
 * Cambio del 2026-11-19, RF-20, RF-27: "lunes 9 a 11 h", for the label "Opciones de lunes 9 a 11 h" and
 * the question "¿Eliminar la franja del lunes de 9 a 11 h?".
 */
export function slotName(slot: Pick<ScheduleSlot, "weekday" | "starts_at" | "ends_at">): string {
  return `${dayName(slot.weekday)} ${formatSlot(slot.starts_at, slot.ends_at)}`;
}

/** Cambio del 2026-11-19, RF-20: "la franja del lunes de 9 a 11 h", for "¿Eliminar la franja del lunes de 9 a 11 h?". */
export function slotDeletionName(slot: Pick<ScheduleSlot, "weekday" | "starts_at" | "ends_at">): string {
  return `la franja del ${dayName(slot.weekday)} de ${formatSlot(slot.starts_at, slot.ends_at)}`;
}

export type SlotToggle = { kind: "save" } | { kind: "confirm"; message: string } | { kind: "blocked"; message: string };

/**
 * Cambio del 2026-11-19, RF-19: what "Desactivar" or "Activar" of the menu does. Turning a slot on is
 * blocked when it would overlap an active one of the same day (RF-8, the text of slotProblem); turning it
 * off asks first when it has orders in progress (RF-13); anything else is saved.
 */
export function slotToggle(slot: ScheduleSlot, slots: readonly ScheduleSlot[]): SlotToggle {
  const after = { ...slot, active: !slot.active };
  const problem = slotProblem(after, slots);
  if (problem) return { kind: "blocked", message: problem };
  if (slotChangeNeedsWarning(slot, after)) return { kind: "confirm", message: activeOrdersText(slot.active_orders ?? 0) };
  return { kind: "save" };
}

/**
 * RF-8, RF-9, RF-16: what the base answered, when something changed after the form was opened. Cambio del
 * 2026-11-19, RF-22: a slot with orders in progress is not deleted, and the hint counts them.
 */
export function slotErrorMessage(error: unknown): string {
  if (isPostgresError(error)) {
    if (error.code === "") return NO_CONNECTION;
    if (error.code === "P0001" && error.message === "slot_has_active_orders") {
      const count = Number(error.hint);
      return count === 1 ? "Tiene 1 pedido en curso" : `Tiene ${count} pedidos en curso`;
    }
    if (error.code === "P0002") return "Esa franja ya no existe";
    if (error.code === "23P01") return "Se superpone con otra franja activa del mismo día";
    if (error.code === "23505") return "Ya hay una franja ese día a esa hora";
    if (error.code === "23514") return "Revisá el horario y el cupo";
  }
  return "No pudimos guardar. Intentá de nuevo";
}

// The delivery days and slots of the checkout (spec 004: RF-2, RF-3, RF-21). The base decides which
// slots are offered and which are full (delivery_options); these only lay them out by day. Nothing here
// reads the clock: "now" comes in as a parameter.
import { addDays, toBuenosAiresDate } from "./dates";

/** A row of delivery_options(): times as Postgres writes them ("09:00:00"). */
export type DeliveryOption = {
  delivery_date: string;
  slot_id: number;
  starts_at: string;
  ends_at: string;
  is_full: boolean;
};

export type DaySlots = {
  date: string;
  slots: { id: number; label: string; full: boolean }[];
  /** At least one slot that is not full: otherwise the day shows "Sin horarios" (RF-21). */
  hasChoice: boolean;
};

const DELIVERY_DAYS = 7;

/** RF-2: today and the next 6 days, as Buenos Aires dates. */
export function deliveryDays(now: Date): string[] {
  const today = toBuenosAiresDate(now);
  return Array.from({ length: DELIVERY_DAYS }, (_, index) => addDays(today, index));
}

function formatHour(time: string): string {
  const [hours, minutes] = time.split(":");
  const hour = String(Number(hours));
  return minutes === "00" ? hour : `${hour}:${minutes}`;
}

/** "9 a 11 h", "9:30 a 11 h". */
export function formatSlot(startsAt: string, endsAt: string): string {
  return `${formatHour(startsAt)} a ${formatHour(endsAt)} h`;
}

/** RF-3, RF-21: each delivery day with its slots by time; options of other days are left out. */
export function groupSlotsByDay(days: readonly string[], options: readonly DeliveryOption[]): DaySlots[] {
  return days.map((date) => {
    const slots = options
      .filter((option) => option.delivery_date === date)
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
      .map((option) => ({ id: option.slot_id, label: formatSlot(option.starts_at, option.ends_at), full: option.is_full }));
    return { date, slots, hasChoice: slots.some((slot) => !slot.full) };
  });
}

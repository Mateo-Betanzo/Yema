// The delivery schedule of the admin (spec 009) with TanStack Query. The base keeps every rule of a slot
// (T1); these hooks read the schedule and write a slot. Errors are the Supabase ones; the form turns them
// into messages with slotErrorMessage.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { orderKeys } from "./orders";
import { supabase } from "./supabase";

export const scheduleKeys = {
  slots: ["delivery-slots"],
} as const;

function unwrap<T>({ data, error }: { data: T; error: unknown }): T {
  if (error) throw error;
  return data;
}

/** RF-2, RF-3, RF-13: every slot, active or not, by day and start, with its orders in progress. */
export function useDeliverySlots() {
  return useQuery({
    queryKey: scheduleKeys.slots,
    queryFn: async () =>
      unwrap(await supabase.from("delivery_slot_overview").select("*").order("weekday").order("starts_at")),
  });
}

export type SlotInput = {
  /** Present when the slot is edited. */
  id?: number;
  weekday: number;
  /** "09:00" */
  starts_at: string;
  ends_at: string;
  capacity: number;
  active: boolean;
};

/**
 * RF-4, RF-5, RF-10, RF-11: creates a slot with its day, or changes one without it (the base does not
 * let the day change). When it works, the schedule and the slots the checkout offers refresh.
 */
export function useSaveDeliverySlot() {
  return useScheduleMutation(async ({ id, weekday, ...fields }: SlotInput) =>
    unwrap(
      await (id === undefined
        ? supabase.from("delivery_slots").insert({ weekday, ...fields })
        : supabase.from("delivery_slots").update(fields).eq("id", id)),
    ),
  );
}

/**
 * Cambio del 2026-11-19, RF-21, RF-22: "Eliminar" archives the slot through archive_delivery_slot, which
 * refuses one with orders in progress (slot_has_active_orders). When it works, the same refresh as a save.
 */
export function useArchiveDeliverySlot() {
  return useScheduleMutation(async (slotId: number) =>
    unwrap(await supabase.rpc("archive_delivery_slot", { p_slot_id: slotId })),
  );
}

// A write of the schedule: when it works, the schedule and the slots the checkout offers refresh; when it
// fails, nothing does.
function useScheduleMutation<V>(write: (variables: V) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: write,
    onSuccess: async () => {
      await Promise.all(
        [scheduleKeys.slots, orderKeys.deliveryOptions].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
    },
  });
}

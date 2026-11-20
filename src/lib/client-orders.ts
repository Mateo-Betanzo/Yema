// The orders of the client (spec 006) with TanStack Query: its Home and its order detail read the same
// query (client_orders()), and the client cancels its pending order (cancel_order). The base decides who
// sees what and whether a cancellation is valid; these hooks only ask and show. Errors are the Supabase
// ones; the screens turn them into messages with orderStatusErrorMessage (the same order_changed,
// 42501 and network errors of spec 005).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { catalogKeys } from "./catalog";
import type { Database } from "./database.types";
import { orderKeys } from "./orders";
import { supabase } from "./supabase";
import type { ClientOrderBase, ClientOrderItem } from "@/logic/client-orders";

type ClientOrderRow = Database["public"]["Functions"]["client_orders"]["Returns"][number];

/**
 * A row of client_orders(). The generated types of a function that returns a table have no nulls, so
 * the fields that can be empty are declared here (ClientOrderBase) and the lines get their shape.
 */
export type ClientOrder = Omit<ClientOrderRow, keyof ClientOrderBase | "address_notes"> &
  ClientOrderBase & { address_notes: string | null };

export const clientOrderKeys = {
  all: ["client-orders"],
} as const;

function unwrap<T>({ data, error }: { data: T; error: unknown }): T {
  if (error) throw error;
  return data;
}

async function fetchClientOrders(): Promise<ClientOrder[]> {
  const rows = unwrap(await supabase.rpc("client_orders")) ?? [];
  return rows.map((row) => ({ ...row, items: row.items as unknown as ClientOrderItem[] }));
}

/** RF-2, RF-10, RF-13, RF-18: every order of the client, the newest first. */
export function useClientOrders() {
  return useQuery({ queryKey: clientOrderKeys.all, queryFn: fetchClientOrders });
}

/** RF-4, RF-21, RF-22: one order of the client, from the same query as the Home; null if it is not its. */
export function useClientOrder(id: number) {
  return useQuery({
    queryKey: clientOrderKeys.all,
    queryFn: fetchClientOrders,
    select: (orders) => orders.find((order) => order.id === id) ?? null,
  });
}

/**
 * RF-5 to RF-9: cancels the pending order of the client and returns its new status. Whatever happens,
 * the orders, the active order (the Shop lets the client buy again, RF-9), the Shop (the reservation
 * was freed) and the slots (its place was freed) refresh: after a cancellation they changed, and after
 * a refusal (RF-8) they are what was out of date.
 */
export function useCancelOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (orderId: number) => unwrap(await supabase.rpc("cancel_order", { p_order_id: orderId })),
    onSettled: async () => {
      await Promise.all(
        [clientOrderKeys.all, orderKeys.activeOrder, catalogKeys.shopProducts, orderKeys.deliveryOptions].map(
          (queryKey) => queryClient.invalidateQueries({ queryKey }),
        ),
      );
    },
  });
}

// Reads and writes of orders (spec 004) with TanStack Query. The base decides which slots are offered,
// whether the client has an active order and everything about a new order (create_order): these hooks
// only ask and show. Errors are the Supabase ones; screens turn them into messages with
// orderErrorMessage and decide what to refresh with orderErrorKind.
import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useEffect } from "react";

import { catalogKeys } from "./catalog";
import type { Database } from "./database.types";
import { supabase } from "./supabase";

type Functions = Database["public"]["Functions"];
export type DeliveryOptionRow = Functions["delivery_options"]["Returns"][number];
export type CreatedOrder = Functions["create_order"]["Returns"][number];

export const orderKeys = {
  deliveryOptions: ["delivery-options"],
  activeOrder: ["active-order"],
} as const;

const ACTIVE_STATUSES = ["pending", "accepted", "on_the_way"] as const;

function unwrap<T>({ data, error }: { data: T; error: unknown }): T {
  if (error) throw error;
  return data;
}

/** RF-2, RF-3, RF-21: the slots of the next 7 days that can be picked or are full. */
export function useDeliveryOptions() {
  return useQuery({
    queryKey: orderKeys.deliveryOptions,
    queryFn: async () => unwrap(await supabase.rpc("delivery_options")),
  });
}

/** RF-23, RF-36: the own active order, or null. RLS gives a client only its own orders. */
export function useActiveOrder() {
  return useQuery({
    queryKey: orderKeys.activeOrder,
    queryFn: async () => {
      const rows = unwrap(await supabase.from("orders").select("id, status").in("status", ACTIVE_STATUSES).limit(1));
      return rows?.[0] ?? null;
    },
  });
}

export type CreateOrderInput = {
  deliveryDate: string;
  slotId: number;
  items: { product_id: number; quantity: number }[];
  /** The total the client saw: the base rejects the order if its own is different (RF-25). */
  expectedTotal: number;
};

/**
 * RF-24 to RF-28: creates the order and returns it. Whatever happens, the Shop, the active order and
 * the slots refresh: after an order they changed, and after a rejection they are what was out of date.
 */
export function useCreateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ deliveryDate, slotId, items, expectedTotal }: CreateOrderInput): Promise<CreatedOrder> => {
      const rows = unwrap(
        await supabase.rpc("create_order", {
          p_delivery_date: deliveryDate,
          p_slot_id: slotId,
          p_items: items,
          p_expected_total: expectedTotal,
        }),
      );
      const order = rows?.[0];
      if (!order) throw new Error("create_order returned no order");
      return order;
    },
    onSettled: async () => {
      await Promise.all(
        [catalogKeys.shopProducts, orderKeys.activeOrder, orderKeys.deliveryOptions].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      );
    },
  });
}

/**
 * Spec 005 (RF-5, RF-20) and 006 (RF-26): while the screen is mounted, every new or changed order
 * refreshes `queryKeys`. Postgres Changes authorizes each event with the RLS of orders, so the admin
 * receives them all and a client only those of its own orders (spec 005 RF-23, spec 006 RF-28). The
 * event only says "something changed": the data is read again with its own query. Pass `queryKeys` as a
 * constant (outside the component): a new array each render would reopen the channel.
 */
export function useOrdersRealtime(channel: string, queryKeys: readonly QueryKey[]) {
  const queryClient = useQueryClient();
  useEffect(() => {
    const subscription = supabase
      .channel(channel)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        for (const queryKey of queryKeys) void queryClient.invalidateQueries({ queryKey });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(subscription);
    };
  }, [queryClient, channel, queryKeys]);
}

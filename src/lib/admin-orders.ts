// The orders of the admin (spec 005) with TanStack Query: the Home list, one order and the status
// changes (Realtime is useOrdersRealtime in orders.ts, shared with the client). Spec 007 adds the
// totals, the sales by type and the history of finished orders, under the same first key. The base decides which change is valid and does it (set_order_status); these hooks only
// ask and show. Errors are the Supabase ones; the screens turn them into messages with
// orderStatusErrorMessage and decide what to do with orderStatusErrorKind.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { isAppOrder, type AppOrderFields } from "@/logic/admin-orders";

import { catalogKeys } from "./catalog";
import type { Database, Tables } from "./database.types";
import { supabase } from "./supabase";

export type AdminOrder = Tables<"admin_order_overview">;
/** An order of the app, with its day, slot and address (spec 008: a counter sale has none). */
export type AppAdminOrder = AdminOrder & AppOrderFields;
export type OrderStatus = Database["public"]["Enums"]["order_status"];
type Functions = Database["public"]["Functions"];
export type AdminTotals = Functions["admin_totals"]["Returns"][number];
export type SalesByTypeRow = Functions["admin_sales_by_type"]["Returns"][number];
export type CounterSale = Functions["create_counter_sale"]["Returns"][number];

export const adminOrderKeys = {
  /** Every admin order query starts with this key, so one invalidation refreshes them all. */
  all: ["admin-orders"],
  list: ["admin-orders", "list"],
  detail: (id: number) => ["admin-orders", "detail", id],
  /** Spec 007: under the same first key, so Realtime and a status change refresh them too (RF-4, RF-19). */
  totals: ["admin-orders", "totals"],
  salesByType: ["admin-orders", "sales-by-type"],
  history: ["admin-orders", "history"],
} as const;

const ACTIVE_STATUSES = ["pending", "accepted", "on_the_way"] as const;
const FINISHED_STATUSES = ["delivered", "rejected", "cancelled"] as const;

function unwrap<T>({ data, error }: { data: T; error: unknown }): T {
  if (error) throw error;
  return data;
}

/**
 * RF-1, RF-2, RF-24: the active orders, by day, slot and creation (groupAdminOrders splits them). An
 * active order is always an order of the app (a counter sale is born delivered, spec 008), so each one
 * has its day, slot and address.
 */
export function useAdminOrders() {
  return useQuery({
    queryKey: adminOrderKeys.list,
    queryFn: async (): Promise<AppAdminOrder[]> =>
      (
        unwrap(
          await supabase
            .from("admin_order_overview")
            .select("*")
            .in("status", ACTIVE_STATUSES)
            .order("delivery_date")
            .order("slot_starts_at")
            .order("created_at"),
        ) ?? []
      ).filter(isAppOrder),
  });
}

/** RF-7: one order in any status, or null if it does not exist. */
export function useAdminOrder(id: number) {
  return useQuery({
    queryKey: adminOrderKeys.detail(id),
    queryFn: async () => unwrap(await supabase.from("admin_order_overview").select("*").eq("id", id).maybeSingle()),
  });
}

/**
 * Spec 007, RF-1 to RF-3, RF-6: income of today, this week and this month, orders delivered today and
 * orders to deliver today, computed by the base (admin_totals; anyone but the admin gets 42501).
 */
export function useAdminTotals() {
  return useQuery({
    queryKey: adminOrderKeys.totals,
    queryFn: async (): Promise<AdminTotals | null> => unwrap(await supabase.rpc("admin_totals"))?.[0] ?? null,
  });
}

/** Spec 007, RF-7 to RF-11: the eggs of maples and packs sold per type this week, month and year. */
export function useSalesByType() {
  return useQuery({
    queryKey: adminOrderKeys.salesByType,
    queryFn: async () => unwrap(await supabase.rpc("admin_sales_by_type")),
  });
}

/** Spec 007, RF-14: every finished order of every client (historySections orders and groups them). */
export function useOrderHistory() {
  return useQuery({
    queryKey: adminOrderKeys.history,
    queryFn: async () =>
      unwrap(await supabase.from("admin_order_overview").select("*").in("status", FINISHED_STATUSES)),
  });
}

// What a delivery moves, so a status change and a counter sale refresh the same: the orders (and the
// totals, sales and history under the same key), the stock, the products, the Shop and the stock history.
const DELIVERY_KEYS = [
  adminOrderKeys.all,
  catalogKeys.eggTypes,
  catalogKeys.stockOverview,
  catalogKeys.productOverview,
  catalogKeys.shopProducts,
  // Every type's history: a delivery may touch several types.
  ["stock-history"],
] as const;

export type CreateCounterSaleInput = {
  items: { product_id: number; quantity: number }[];
  /** The total the admin saw: the base rejects the sale if its own is different (spec 008, RF-11). */
  expectedTotal: number;
  /** Optional; the base trims it and keeps an empty one as no name (RF-6). */
  customerName: string;
};

/**
 * Spec 008, RF-9 to RF-14: registers a counter sale and returns its number and total. Whatever happens,
 * what a delivery moves refreshes: after a sale it changed, and after a refusal it is what was out of
 * date (RF-11).
 */
export function useCreateCounterSale() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ items, expectedTotal, customerName }: CreateCounterSaleInput): Promise<CounterSale> => {
      const name = customerName.trim();
      const rows = unwrap(
        await supabase.rpc("create_counter_sale", {
          p_items: items,
          p_expected_total: expectedTotal,
          ...(name ? { p_customer_name: name } : {}),
        }),
      );
      const sale = rows?.[0];
      if (!sale) throw new Error("create_counter_sale returned no sale");
      return sale;
    },
    onSettled: async () => {
      await Promise.all(DELIVERY_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
    },
  });
}

export type SetOrderStatusInput = { orderId: number; status: OrderStatus; reason: string | null };

/**
 * RF-11 to RF-15: changes the status and returns it. Whatever happens, the orders, the stock (a
 * delivery subtracts it and leaves a sale in the history), the products and the Shop refresh: after a
 * change they moved, and after a refusal they are what was out of date (RF-17).
 */
export function useSetOrderStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, status, reason }: SetOrderStatusInput) =>
      unwrap(
        await supabase.rpc("set_order_status", {
          p_order_id: orderId,
          p_status: status,
          ...(reason === null ? {} : { p_reason: reason }),
        }),
      ),
    onSettled: async () => {
      await Promise.all(DELIVERY_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
    },
  });
}

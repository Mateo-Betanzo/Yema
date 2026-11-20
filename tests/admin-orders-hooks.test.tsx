import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";

import {
  adminOrderKeys,
  useAdminOrder,
  useAdminOrders,
  useAdminTotals,
  useCreateCounterSale,
  useOrderHistory,
  useSalesByType,
  useSetOrderStatus,
} from "@/lib/admin-orders";
import { catalogKeys } from "@/lib/catalog";

// Spec 005 · T5: which view and RPC the admin order hooks use, and what changing a status refreshes
// (RF-11 to RF-15, RF-20). The Supabase client is replaced with a recorder. The Realtime channel moved
// to orders.ts in spec 006 (tests/orders-hooks.test.tsx).
type Call = [string, string, unknown[]];
let mockCalls: Call[] = [];
let mockResult: { data: unknown; error: unknown } = { data: [], error: null };

jest.mock("@/lib/supabase", () => {
  function builder(target: string) {
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "in", "order", "eq", "maybeSingle"]) {
      chain[method] = (...args: unknown[]) => {
        mockCalls.push([target, method, args]);
        return chain;
      };
    }
    chain.then = (resolve: (value: unknown) => unknown) => resolve(mockResult);
    return chain;
  }
  return {
    supabase: {
      from: (table: string) => builder(table),
      rpc: (name: string, params?: unknown) => {
        mockCalls.push([name, "rpc", params === undefined ? [] : [params]]);
        return Promise.resolve(mockResult);
      },
    },
  };
});

let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  mockCalls = [];
  mockResult = { data: [], error: null };
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } },
  });
});

afterEach(() => client.clear());

async function query<T>(hook: () => { isSuccess: boolean; data?: T }) {
  const { result } = await renderHook(hook, { wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  return result.current.data;
}

const invalidatedKeys = (spy: jest.SpyInstance) => spy.mock.calls.map(([filters]) => filters?.queryKey);

describe("admin order queries", () => {
  test("RF-1, RF-2, RF-24: the active orders of admin_order_overview, by day, slot and creation", async () => {
    mockResult = { data: [{ id: 1 }], error: null };
    expect(await query(useAdminOrders)).toEqual([{ id: 1 }]);
    expect(mockCalls).toEqual([
      ["admin_order_overview", "select", ["*"]],
      ["admin_order_overview", "in", ["status", ["pending", "accepted", "on_the_way"]]],
      ["admin_order_overview", "order", ["delivery_date"]],
      ["admin_order_overview", "order", ["slot_starts_at"]],
      ["admin_order_overview", "order", ["created_at"]],
    ]);
  });

  test("RF-7: one order by its number, in any status (null if it does not exist)", async () => {
    mockResult = { data: { id: 187 }, error: null };
    expect(await query(() => useAdminOrder(187))).toEqual({ id: 187 });
    expect(mockCalls).toEqual([
      ["admin_order_overview", "select", ["*"]],
      ["admin_order_overview", "eq", ["id", 187]],
      ["admin_order_overview", "maybeSingle", []],
    ]);
  });
});

describe("useSetOrderStatus", () => {
  const refreshed = [
    adminOrderKeys.all,
    catalogKeys.eggTypes,
    catalogKeys.stockOverview,
    catalogKeys.productOverview,
    catalogKeys.shopProducts,
    ["stock-history"],
  ];

  test("RF-11 to RF-15: calls set_order_status; orders, stock, products, Shop and history refresh", async () => {
    mockResult = { data: "rejected", error: null };
    const invalidate = jest.spyOn(client, "invalidateQueries");
    const { result } = await renderHook(useSetOrderStatus, { wrapper });
    let status: unknown;
    await act(async () => {
      status = await result.current.mutateAsync({ orderId: 187, status: "rejected", reason: "Fuera de zona" });
    });
    expect(status).toBe("rejected");
    expect(mockCalls).toEqual([
      ["set_order_status", "rpc", [{ p_order_id: 187, p_status: "rejected", p_reason: "Fuera de zona" }]],
    ]);
    expect(invalidatedKeys(invalidate)).toEqual(refreshed);
  });

  test("without a reason, it sends none", async () => {
    mockResult = { data: "accepted", error: null };
    const { result } = await renderHook(useSetOrderStatus, { wrapper });
    await act(() => result.current.mutateAsync({ orderId: 5, status: "accepted", reason: null }));
    expect(mockCalls).toEqual([["set_order_status", "rpc", [{ p_order_id: 5, p_status: "accepted" }]]]);
  });

  test("RF-17: a refused change fails with the Supabase error and refreshes the same", async () => {
    const error = { code: "P0001", message: "order_changed", hint: "cancelled" };
    mockResult = { data: null, error };
    const invalidate = jest.spyOn(client, "invalidateQueries");
    const { result } = await renderHook(useSetOrderStatus, { wrapper });
    await expect(act(() => result.current.mutateAsync({ orderId: 5, status: "accepted", reason: null }))).rejects.toBe(error);
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(refreshed.length));
    expect(invalidatedKeys(invalidate)).toEqual(refreshed);
  });
});

// Spec 007 · T3: the totals, the sales by type and the history of the admin (RF-1 to RF-3, RF-6, RF-7,
// RF-14, RF-19). Their keys start with adminOrderKeys.all, so the Realtime of the Home and of the
// Dashboard and a status change refresh them with the orders.
describe("dashboard queries (spec 007)", () => {
  test("RF-1 to RF-3, RF-6: the totals are the one row of admin_totals", async () => {
    const totals = { income_today: 10000, delivered_today: 1, to_deliver: 2, income_week: 70000, income_month: 310000 };
    mockResult = { data: [totals], error: null };
    expect(await query(useAdminTotals)).toEqual(totals);
    expect(mockCalls).toEqual([["admin_totals", "rpc", []]]);
  });

  test("RF-7: the sales by type are the rows of admin_sales_by_type", async () => {
    const rows = [{ egg_type_id: 1, name: "Medianos", active: true, eggs_week: 240, eggs_month: 270, eggs_year: 630 }];
    mockResult = { data: rows, error: null };
    expect(await query(useSalesByType)).toEqual(rows);
    expect(mockCalls).toEqual([["admin_sales_by_type", "rpc", []]]);
  });

  test("RF-14: the history is every finished order of admin_order_overview", async () => {
    mockResult = { data: [{ id: 187 }], error: null };
    expect(await query(useOrderHistory)).toEqual([{ id: 187 }]);
    expect(mockCalls).toEqual([
      ["admin_order_overview", "select", ["*"]],
      ["admin_order_overview", "in", ["status", ["delivered", "rejected", "cancelled"]]],
    ]);
  });

  test("a refused read fails with the Supabase error", async () => {
    const error = { code: "42501", message: "only the admin reads the totals" };
    mockResult = { data: null, error };
    const { result } = await renderHook(useAdminTotals, { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(error);
  });

  test("RF-19: invalidating the admin orders refreshes the totals, the sales and the history", async () => {
    mockResult = { data: [], error: null };
    await query(useAdminTotals);
    await query(useSalesByType);
    await query(useOrderHistory);
    mockCalls = [];
    await act(() => client.invalidateQueries({ queryKey: adminOrderKeys.all }));
    await waitFor(() =>
      expect(new Set(mockCalls.map(([target]) => target))).toEqual(
        new Set(["admin_totals", "admin_sales_by_type", "admin_order_overview"]),
      ),
    );
    // Let the refetches land inside the test, so none updates a hook after it ends.
    await waitFor(() => expect(client.isFetching()).toBe(0));
  });
});

// Spec 008 · T3: registering a counter sale (RF-9 to RF-14). It moves what a delivery moves.
describe("useCreateCounterSale (spec 008)", () => {
  const refreshed = [
    adminOrderKeys.all,
    catalogKeys.eggTypes,
    catalogKeys.stockOverview,
    catalogKeys.productOverview,
    catalogKeys.shopProducts,
    ["stock-history"],
  ];
  const input = {
    items: [{ product_id: 3, quantity: 12 }],
    expectedTotal: 60000,
    customerName: "Juan",
  };

  test("RF-10, RF-14: calls create_counter_sale and gives back the sale; orders, stock, products, Shop and history refresh", async () => {
    mockResult = { data: [{ order_id: 212, total: 60000 }], error: null };
    const invalidate = jest.spyOn(client, "invalidateQueries");
    const { result } = await renderHook(useCreateCounterSale, { wrapper });
    let sale: unknown;
    await act(async () => {
      sale = await result.current.mutateAsync(input);
    });
    expect(sale).toEqual({ order_id: 212, total: 60000 });
    expect(mockCalls).toEqual([
      ["create_counter_sale", "rpc", [{ p_items: input.items, p_expected_total: 60000, p_customer_name: "Juan" }]],
    ]);
    expect(invalidatedKeys(invalidate)).toEqual(refreshed);
  });

  test("RF-6: without a name, it sends none", async () => {
    mockResult = { data: [{ order_id: 213, total: 5000 }], error: null };
    const { result } = await renderHook(useCreateCounterSale, { wrapper });
    await act(() => result.current.mutateAsync({ ...input, customerName: "  " }));
    expect(mockCalls[0]?.[2]).toEqual([{ p_items: input.items, p_expected_total: 60000 }]);
  });

  test("RF-11: a refused sale fails with the Supabase error and refreshes the same", async () => {
    const error = { code: "P0001", message: "not_enough_units", hint: "Maple Grandes" };
    mockResult = { data: null, error };
    const invalidate = jest.spyOn(client, "invalidateQueries");
    const { result } = await renderHook(useCreateCounterSale, { wrapper });
    await expect(act(() => result.current.mutateAsync(input))).rejects.toBe(error);
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(refreshed.length));
    expect(invalidatedKeys(invalidate)).toEqual(refreshed);
  });
});

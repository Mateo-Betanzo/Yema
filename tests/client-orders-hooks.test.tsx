import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";

import { catalogKeys } from "@/lib/catalog";
import { clientOrderKeys, useCancelOrder, useClientOrder, useClientOrders } from "@/lib/client-orders";
import { orderKeys } from "@/lib/orders";

// Spec 006 · T4: which RPC the client order hooks use and what cancelling refreshes (RF-5 to RF-9,
// RF-22, RF-26, RF-27). The Supabase client is replaced with a recorder, as in orders-hooks.test.tsx.
type Call = [string, string, unknown[]];
let mockCalls: Call[] = [];
let mockResult: { data: unknown; error: unknown } = { data: [], error: null };

jest.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: (name: string, params?: unknown) => {
      mockCalls.push([name, "rpc", params === undefined ? [] : [params]]);
      return Promise.resolve(mockResult);
    },
  },
}));

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

const ROW = {
  id: 187,
  delivery_date: "2026-11-16",
  slot_starts_at: "09:00:00",
  slot_ends_at: "11:00:00",
  status: "pending",
  status_reason: null,
  cancelled_by: null,
  total: 10000,
  address: "Calle 1",
  address_notes: null,
  created_at: "2026-11-13T12:00:00Z",
  accepted_at: null,
  on_the_way_at: null,
  delivered_at: null,
  rejected_at: null,
  cancelled_at: null,
  units: 2,
  items: [
    { product_id: 1, name: "Maple Grandes", egg_type_name: "Grandes", format_name: "Maple", quantity: 2, unit_price: 5000 },
  ],
};

describe("client order queries", () => {
  test("RF-2, RF-18, RF-22: the orders of the client come from the client_orders RPC", async () => {
    mockResult = { data: [ROW, { ...ROW, id: 150, status: "delivered" }], error: null };
    expect(await query(useClientOrders)).toEqual([ROW, { ...ROW, id: 150, status: "delivered" }]);
    expect(mockCalls).toEqual([["client_orders", "rpc", []]]);
  });

  test("RF-22: without orders, an empty list", async () => {
    mockResult = { data: null, error: null };
    expect(await query(useClientOrders)).toEqual([]);
  });

  test("RF-4, RF-21: one order comes from the same query as the Home, so it shows at once", async () => {
    mockResult = { data: [ROW, { ...ROW, id: 150 }], error: null };
    expect(await query(useClientOrders)).toHaveLength(2);
    const { result } = await renderHook(() => useClientOrder(150), { wrapper });
    // Already there on its first render, from the Home's data; one cached query for both.
    expect(result.current.data).toEqual({ ...ROW, id: 150 });
    expect(client.getQueryCache().getAll().map((cached) => cached.queryKey)).toEqual([clientOrderKeys.all]);
    await waitFor(() => expect(result.current.isFetching).toBe(false));
  });

  test("an order that is not among the client's is null", async () => {
    mockResult = { data: [ROW], error: null };
    expect(await query(() => useClientOrder(999))).toBeNull();
  });

  test("a failed read fails with the Supabase error", async () => {
    const error = { code: "", message: "TypeError: Network request failed" };
    mockResult = { data: null, error };
    const { result } = await renderHook(useClientOrders, { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(error);
  });
});

describe("useCancelOrder (RF-5 to RF-9)", () => {
  const refreshed = [clientOrderKeys.all, orderKeys.activeOrder, catalogKeys.shopProducts, orderKeys.deliveryOptions];
  const invalidatedKeys = (spy: jest.SpyInstance) => spy.mock.calls.map(([filters]) => filters?.queryKey);

  test("RF-7, RF-9: calls cancel_order; the orders, the active order, the Shop and the slots refresh", async () => {
    mockResult = { data: "cancelled", error: null };
    const invalidate = jest.spyOn(client, "invalidateQueries");
    const { result } = await renderHook(useCancelOrder, { wrapper });

    let status: unknown;
    await act(async () => {
      status = await result.current.mutateAsync(187);
    });

    expect(status).toBe("cancelled");
    expect(mockCalls).toEqual([["cancel_order", "rpc", [{ p_order_id: 187 }]]]);
    expect(invalidatedKeys(invalidate)).toEqual(refreshed);
  });

  test("RF-8: a refused cancellation fails with the Supabase error and refreshes the same", async () => {
    const error = { code: "P0001", message: "order_changed", hint: "accepted" };
    mockResult = { data: null, error };
    const invalidate = jest.spyOn(client, "invalidateQueries");
    const { result } = await renderHook(useCancelOrder, { wrapper });

    await expect(act(() => result.current.mutateAsync(187))).rejects.toBe(error);
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(refreshed.length));
    expect(invalidatedKeys(invalidate)).toEqual(refreshed);
  });
});

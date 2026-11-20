import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";

import { catalogKeys } from "@/lib/catalog";
import { orderKeys, useActiveOrder, useCreateOrder, useDeliveryOptions, useOrdersRealtime } from "@/lib/orders";

// Spec 004 · T7: which RPC or table each order hook uses, and what creating an order refreshes. Spec
// 005 · T5 and 006 · T4: the Realtime channel of orders, shared by the admin and the client Home. The
// Supabase client is replaced with a recorder, as in catalog-hooks.test.tsx.
type Call = [string, string, unknown[]];
let mockCalls: Call[] = [];
let mockResult: { data: unknown; error: unknown } = { data: [], error: null };
const mockRealtime: { handler: (() => void) | null; removed: number } = { handler: null, removed: 0 };

jest.mock("@/lib/supabase", () => {
  function builder(target: string) {
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "in", "limit"]) {
      chain[method] = (...args: unknown[]) => {
        mockCalls.push([target, method, args]);
        return chain;
      };
    }
    chain.then = (resolve: (value: unknown) => unknown) => resolve(mockResult);
    return chain;
  }
  const channel = {
    on: (type: string, filter: unknown, handler: () => void) => {
      mockCalls.push(["channel", "on", [type, filter]]);
      mockRealtime.handler = handler;
      return channel;
    },
    subscribe: () => {
      mockCalls.push(["channel", "subscribe", []]);
      return channel;
    },
  };
  return {
    supabase: {
      from: (table: string) => builder(table),
      rpc: (name: string, params?: unknown) => {
        mockCalls.push([name, "rpc", params === undefined ? [] : [params]]);
        return Promise.resolve(mockResult);
      },
      channel: (name: string) => {
        mockCalls.push(["channel", "create", [name]]);
        return channel;
      },
      removeChannel: () => {
        mockRealtime.removed++;
        return Promise.resolve("ok");
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
  mockRealtime.handler = null;
  mockRealtime.removed = 0;
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

describe("order queries", () => {
  test("RF-2, RF-21: the slots come from the delivery_options RPC", async () => {
    const options = [{ delivery_date: "2026-11-16", slot_id: 1, starts_at: "09:00:00", ends_at: "11:00:00", is_full: false }];
    mockResult = { data: options, error: null };
    expect(await query(useDeliveryOptions)).toEqual(options);
    expect(mockCalls).toEqual([["delivery_options", "rpc", []]]);
  });

  test("RF-23, RF-36: the active order is the first own order pending, accepted or on the way", async () => {
    mockResult = { data: [{ id: 8, status: "pending" }], error: null };
    expect(await query(useActiveOrder)).toEqual({ id: 8, status: "pending" });
    expect(mockCalls).toEqual([
      ["orders", "select", ["id, status"]],
      ["orders", "in", ["status", ["pending", "accepted", "on_the_way"]]],
      ["orders", "limit", [1]],
    ]);
  });

  test("RF-23, RF-36: without an active order it is null", async () => {
    mockResult = { data: [], error: null };
    expect(await query(useActiveOrder)).toBeNull();
  });
});

describe("useCreateOrder (RF-24)", () => {
  const variables = {
    deliveryDate: "2026-11-18",
    slotId: 5,
    items: [{ product_id: 1, quantity: 2 }],
    expectedTotal: 21000,
  };

  test("calls create_order and gives back the order; the Shop, the active order and the slots refresh", async () => {
    const order = { order_id: 3, delivery_date: "2026-11-18", starts_at: "09:00:00", ends_at: "11:00:00", total: 21000 };
    mockResult = { data: [order], error: null };
    const invalidate = jest.spyOn(client, "invalidateQueries");
    const { result } = await renderHook(useCreateOrder, { wrapper });

    let created: unknown;
    await act(async () => {
      created = await result.current.mutateAsync(variables);
    });

    expect(created).toEqual(order);
    expect(mockCalls).toEqual([
      [
        "create_order",
        "rpc",
        [{ p_delivery_date: "2026-11-18", p_slot_id: 5, p_items: [{ product_id: 1, quantity: 2 }], p_expected_total: 21000 }],
      ],
    ]);
    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([
      catalogKeys.shopProducts,
      orderKeys.activeOrder,
      orderKeys.deliveryOptions,
    ]);
  });

  test("RF-25, RF-26, RF-28: a rejected order fails with the Supabase error and refreshes the same", async () => {
    const error = { code: "P0001", message: "slot_unavailable", hint: null };
    mockResult = { data: null, error };
    const invalidate = jest.spyOn(client, "invalidateQueries");
    const { result } = await renderHook(useCreateOrder, { wrapper });

    await expect(act(() => result.current.mutateAsync(variables))).rejects.toBe(error);
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(3));
    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([
      catalogKeys.shopProducts,
      orderKeys.activeOrder,
      orderKeys.deliveryOptions,
    ]);
  });
});

describe("useOrdersRealtime (spec 005 RF-5, RF-20; spec 006 RF-26)", () => {
  const KEYS = [["client-orders"], orderKeys.activeOrder] as const;
  const useListen = () => useOrdersRealtime("client-orders", KEYS);

  test("listens to every change of orders on its channel and refreshes its queries when one arrives", async () => {
    const invalidate = jest.spyOn(client, "invalidateQueries");
    await renderHook(useListen, { wrapper });
    expect(mockCalls).toEqual([
      ["channel", "create", ["client-orders"]],
      ["channel", "on", ["postgres_changes", { event: "*", schema: "public", table: "orders" }]],
      ["channel", "subscribe", []],
    ]);
    expect(invalidate).not.toHaveBeenCalled();

    await act(async () => mockRealtime.handler?.());
    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([["client-orders"], orderKeys.activeOrder]);
  });

  test("closes the channel when the screen unmounts", async () => {
    const view = await renderHook(useListen, { wrapper });
    await view.unmount();
    expect(mockRealtime.removed).toBe(1);
  });
});

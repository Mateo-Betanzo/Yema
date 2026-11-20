import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";

import { orderKeys } from "@/lib/orders";
import { scheduleKeys, useArchiveDeliverySlot, useDeliverySlots, useSaveDeliverySlot } from "@/lib/schedule";

// Spec 009 · T2: where the schedule is read and how a slot is saved (RF-2, RF-4, RF-5, RF-10, RF-11).
// The Supabase client is replaced with a recorder.
type Call = [string, string, unknown[]];
let mockCalls: Call[] = [];
let mockResult: { data: unknown; error: unknown } = { data: [], error: null };

jest.mock("@/lib/supabase", () => {
  function builder(target: string) {
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "order", "insert", "update"]) {
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

const invalidatedKeys = (spy: jest.SpyInstance) => spy.mock.calls.map(([filters]) => filters?.queryKey);
const FIELDS = { weekday: 0, starts_at: "09:00", ends_at: "11:00", capacity: 5, active: true };

describe("schedule queries", () => {
  test("RF-2: the slots come from delivery_slot_overview, by day and start", async () => {
    mockResult = { data: [{ id: 1 }], error: null };
    const { result } = await renderHook(useDeliverySlots, { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: 1 }]);
    expect(mockCalls).toEqual([
      ["delivery_slot_overview", "select", ["*"]],
      ["delivery_slot_overview", "order", ["weekday"]],
      ["delivery_slot_overview", "order", ["starts_at"]],
    ]);
  });
});

describe("useSaveDeliverySlot", () => {
  test("RF-4, RF-10: a new slot is inserted with its day; the schedule and the slots of the checkout refresh", async () => {
    const invalidate = jest.spyOn(client, "invalidateQueries");
    const { result } = await renderHook(useSaveDeliverySlot, { wrapper });
    await act(() => result.current.mutateAsync(FIELDS));
    expect(mockCalls).toEqual([["delivery_slots", "insert", [FIELDS]]]);
    expect(invalidatedKeys(invalidate)).toEqual([scheduleKeys.slots, orderKeys.deliveryOptions]);
  });

  test("RF-5, RF-11: a slot is updated without its day", async () => {
    const { result } = await renderHook(useSaveDeliverySlot, { wrapper });
    await act(() => result.current.mutateAsync({ id: 7, ...FIELDS, capacity: 2, active: false }));
    expect(mockCalls).toEqual([
      ["delivery_slots", "update", [{ starts_at: "09:00", ends_at: "11:00", capacity: 2, active: false }]],
      ["delivery_slots", "eq", ["id", 7]],
    ]);
  });

  test("RF-16: a refused save fails with the Supabase error and refreshes nothing", async () => {
    const error = { code: "23P01", message: "delivery_slots_no_overlap", hint: null };
    mockResult = { data: null, error };
    const invalidate = jest.spyOn(client, "invalidateQueries");
    const { result } = await renderHook(useSaveDeliverySlot, { wrapper });
    await expect(act(() => result.current.mutateAsync(FIELDS))).rejects.toBe(error);
    expect(invalidate).not.toHaveBeenCalled();
  });
});

// Spec 009, cambio del 2026-11-19 · T8: "Eliminar" archives the slot through the RPC (RF-21, RF-22).
describe("useArchiveDeliverySlot", () => {
  test("RF-21: calls archive_delivery_slot; the schedule and the slots of the checkout refresh", async () => {
    const invalidate = jest.spyOn(client, "invalidateQueries");
    const { result } = await renderHook(useArchiveDeliverySlot, { wrapper });
    await act(() => result.current.mutateAsync(7));
    expect(mockCalls).toEqual([["archive_delivery_slot", "rpc", [{ p_slot_id: 7 }]]]);
    expect(invalidatedKeys(invalidate)).toEqual([scheduleKeys.slots, orderKeys.deliveryOptions]);
  });

  test("RF-22: a refused deletion fails with the Supabase error and refreshes nothing", async () => {
    const error = { code: "P0001", message: "slot_has_active_orders", hint: "2" };
    mockResult = { data: null, error };
    const invalidate = jest.spyOn(client, "invalidateQueries");
    const { result } = await renderHook(useArchiveDeliverySlot, { wrapper });
    await expect(act(() => result.current.mutateAsync(7))).rejects.toBe(error);
    expect(invalidate).not.toHaveBeenCalled();
  });
});

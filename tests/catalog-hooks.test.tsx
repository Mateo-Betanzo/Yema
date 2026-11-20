import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";

import {
  catalogKeys,
  useAdjustStock,
  useArchiveEggType,
  useArchiveFormat,
  useArchiveProduct,
  useEggTypes,
  useFormats,
  useLoadStock,
  useProductOverview,
  useSaveFormat,
  useSaveProduct,
  useSaveType,
  useShopProducts,
  useStockHistory,
  useStockOverview,
} from "@/lib/catalog";

// Spec 003 · T4: which table, view or RPC each hook uses, and what each mutation refreshes. The
// Supabase client is replaced with a recorder: every builder call is logged and the query resolves
// to `mockResult` (the query builders of supabase-js are thenables).
type Call = [string, string, unknown[]];
let mockCalls: Call[] = [];
let mockResult: { data: unknown; error: unknown } = { data: [], error: null };

jest.mock("@/lib/supabase", () => {
  function builder(target: string) {
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "is", "in", "order", "limit", "insert", "update"]) {
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
  // gcTime Infinity schedules no garbage-collection timers, which would keep Jest running after the tests.
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

describe("catalog queries", () => {
  test("RF-26: the shop comes from the shop_products RPC", async () => {
    mockResult = { data: [{ id: 1, name: "Pack Mediano" }], error: null };
    expect(await query(useShopProducts)).toEqual([{ id: 1, name: "Pack Mediano" }]);
    expect(mockCalls).toEqual([["shop_products", "rpc", []]]);
  });

  test("RF-16: the admin list comes from product_overview, by name", async () => {
    await query(useProductOverview);
    expect(mockCalls).toEqual([
      ["product_overview", "select", ["*"]],
      ["product_overview", "order", ["name"]],
    ]);
  });

  test("RF-22, RF-45: types by creation order and formats by eggs, without the archived ones", async () => {
    await query(useEggTypes);
    await query(useFormats);
    expect(mockCalls).toEqual([
      ["egg_types", "select", ["*"]],
      ["egg_types", "is", ["archived_at", null]],
      ["egg_types", "order", ["id"]],
      ["formats", "select", ["*"]],
      ["formats", "is", ["archived_at", null]],
      ["formats", "order", ["eggs"]],
    ]);
  });

  test("spec 011, RF-10, RF-12: the history is the last 50 loads and adjustments of every type, with its name", async () => {
    await query(useStockHistory);
    expect(mockCalls).toEqual([
      ["stock_movements", "select", ["id, kind, eggs, packs, note, created_at, egg_types(name)"]],
      ["stock_movements", "in", ["kind", ["load", "adjustment"]]],
      ["stock_movements", "order", ["created_at", { ascending: false }]],
      ["stock_movements", "order", ["id", { ascending: false }]],
      ["stock_movements", "limit", [50]],
    ]);
  });

  test("spec 004, RF-38: the admin stock list comes from egg_type_overview, by creation order", async () => {
    await query(useStockOverview);
    expect(mockCalls).toEqual([
      ["egg_type_overview", "select", ["*"]],
      ["egg_type_overview", "order", ["id"]],
    ]);
  });

  test("a Supabase error reaches the screen as the query error", async () => {
    const error = { code: "42501", message: "permission denied" };
    mockResult = { data: null, error };
    const { result } = await renderHook(useShopProducts, { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(error);
  });
});

describe("catalog mutations", () => {
  async function mutate<V>(hook: () => { mutateAsync: (variables: V) => Promise<unknown> }, variables: V) {
    const invalidate = jest.spyOn(client, "invalidateQueries");
    const { result } = await renderHook(hook, { wrapper });
    await act(() => result.current.mutateAsync(variables));
    return invalidate.mock.calls.map(([filters]) => filters?.queryKey);
  }

  test("RF-2, RF-4: a type is created, or updated by id, and types, products and shop refresh", async () => {
    const invalidated = await mutate(useSaveType, { name: "Codorniz", active: true });
    expect(mockCalls).toEqual([["egg_types", "insert", [{ name: "Codorniz", active: true }]]]);
    expect(invalidated).toEqual([catalogKeys.eggTypes, catalogKeys.productOverview, catalogKeys.shopProducts]);

    mockCalls = [];
    await mutate(useSaveType, { id: 3, name: "Super", active: false });
    expect(mockCalls).toEqual([
      ["egg_types", "update", [{ name: "Super", active: false }]],
      ["egg_types", "eq", ["id", 3]],
    ]);
  });

  test("RF-6, RF-8: a format is created or updated, and formats, products and shop refresh", async () => {
    const invalidated = await mutate(useSaveFormat, { id: 2, name: "Pack", eggs: 150, active: true });
    expect(mockCalls).toEqual([
      ["formats", "update", [{ name: "Pack", eggs: 150, active: true }]],
      ["formats", "eq", ["id", 2]],
    ]);
    expect(invalidated).toEqual([catalogKeys.formats, catalogKeys.productOverview, catalogKeys.shopProducts]);
  });

  test("RF-11, RF-14: a product is created with its type and format; an update never sends them", async () => {
    const product = { name: "Pack Mediano", description: null, price: 10500, active: true };
    const invalidated = await mutate(useSaveProduct, { ...product, egg_type_id: 1, format_id: 2 });
    expect(mockCalls).toEqual([["products", "insert", [{ ...product, egg_type_id: 1, format_id: 2 }]]]);
    expect(invalidated).toEqual([catalogKeys.productOverview, catalogKeys.shopProducts]);

    mockCalls = [];
    await mutate(useSaveProduct, { ...product, id: 9, egg_type_id: 1, format_id: 2 });
    expect(mockCalls).toEqual([
      ["products", "update", [product]],
      ["products", "eq", ["id", 9]],
    ]);
  });

  test("RF-18: a load calls load_stock; types, stock overview, history, products and shop refresh", async () => {
    const invalidated = await mutate(useLoadStock, { eggTypeId: 4, packs: 2, note: "Proveedor" });
    expect(mockCalls).toEqual([["load_stock", "rpc", [{ p_egg_type_id: 4, p_packs: 2, p_note: "Proveedor" }]]]);
    expect(invalidated).toEqual([
      catalogKeys.eggTypes,
      catalogKeys.stockOverview,
      catalogKeys.stockHistory,
      catalogKeys.productOverview,
      catalogKeys.shopProducts,
    ]);
  });

  test("RF-19: an adjustment calls adjust_stock and refreshes the same", async () => {
    const invalidated = await mutate(useAdjustStock, { eggTypeId: 4, eggs: 6, reason: "Rotura" });
    expect(mockCalls).toEqual([["adjust_stock", "rpc", [{ p_egg_type_id: 4, p_eggs: 6, p_reason: "Rotura" }]]]);
    expect(invalidated).toEqual([
      catalogKeys.eggTypes,
      catalogKeys.stockOverview,
      catalogKeys.stockHistory,
      catalogKeys.productOverview,
      catalogKeys.shopProducts,
    ]);
  });

  // Cambio del RF-34 (2026-11-18): "Eliminar" archives through the RPC (RF-44, RF-45).
  test("RF-45: a product is archived by archive_product; products and shop refresh", async () => {
    const invalidated = await mutate(useArchiveProduct, 9);
    expect(mockCalls).toEqual([["archive_product", "rpc", [{ p_product_id: 9 }]]]);
    expect(invalidated).toEqual([catalogKeys.productOverview, catalogKeys.shopProducts]);
  });

  test("RF-45: a type is archived by archive_egg_type; types, stock, products and shop refresh", async () => {
    const invalidated = await mutate(useArchiveEggType, 4);
    expect(mockCalls).toEqual([["archive_egg_type", "rpc", [{ p_egg_type_id: 4 }]]]);
    expect(invalidated).toEqual([
      catalogKeys.eggTypes,
      catalogKeys.stockOverview,
      catalogKeys.productOverview,
      catalogKeys.shopProducts,
    ]);
  });

  test("RF-45: a format is archived by archive_format; formats, products and shop refresh", async () => {
    const invalidated = await mutate(useArchiveFormat, 3);
    expect(mockCalls).toEqual([["archive_format", "rpc", [{ p_format_id: 3 }]]]);
    expect(invalidated).toEqual([catalogKeys.formats, catalogKeys.productOverview, catalogKeys.shopProducts]);
  });

  test("a failed mutation rejects with the Supabase error and refreshes nothing", async () => {
    const error = { code: "P0001", message: "insufficient_stock", hint: "12" };
    mockResult = { data: null, error };
    const invalidate = jest.spyOn(client, "invalidateQueries");
    const { result } = await renderHook(useAdjustStock, { wrapper });
    await expect(
      act(() => result.current.mutateAsync({ eggTypeId: 4, eggs: 60, reason: "Rotura" })),
    ).rejects.toBe(error);
    expect(invalidate).not.toHaveBeenCalled();
  });
});

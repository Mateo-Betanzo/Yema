// Reads and writes of the catalog and the stock (spec 003) with TanStack Query. The base computes the
// stock, the units available and the eggs of each load (RF-35): these hooks only ask and show. Errors
// are the Supabase ones, so screens turn them into messages with catalogErrorMessage.
import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";

import type { Database, Tables } from "./database.types";
import { supabase } from "./supabase";

export type EggType = Tables<"egg_types">;
export type Format = Tables<"formats">;
export type ProductOverview = Tables<"product_overview">;
export type StockOverview = Tables<"egg_type_overview">;
export type ShopProduct = Database["public"]["Functions"]["shop_products"]["Returns"][number];

export const catalogKeys = {
  shopProducts: ["shop-products"],
  productOverview: ["product-overview"],
  eggTypes: ["egg-types"],
  stockOverview: ["stock-overview"],
  formats: ["formats"],
  // Spec 011: one history for every type; a delivery (admin-orders.ts) refreshes the same key.
  stockHistory: ["stock-history"],
} as const;

/** The value of a Supabase response, or its error thrown so the query or mutation fails with it. */
function unwrap<T>({ data, error }: { data: T; error: unknown }): T {
  if (error) throw error;
  return data;
}

// Queries

export function useShopProducts() {
  return useQuery({
    queryKey: catalogKeys.shopProducts,
    queryFn: async () => unwrap(await supabase.rpc("shop_products")),
  });
}

export function useProductOverview() {
  return useQuery({
    queryKey: catalogKeys.productOverview,
    queryFn: async () => unwrap(await supabase.from("product_overview").select("*").order("name")),
  });
}

export function useEggTypes() {
  return useQuery({
    queryKey: catalogKeys.eggTypes,
    // RF-45 (cambio del RF-34): what is archived leaves Tipos y formatos and the product form.
    queryFn: async () => unwrap(await supabase.from("egg_types").select("*").is("archived_at", null).order("id")),
  });
}

export function useFormats() {
  return useQuery({
    queryKey: catalogKeys.formats,
    queryFn: async () => unwrap(await supabase.from("formats").select("*").is("archived_at", null).order("eggs")),
  });
}

/** Spec 004, RF-38: the stock of each type with its reserved eggs and shortfall, for the admin. */
export function useStockOverview() {
  return useQuery({
    queryKey: catalogKeys.stockOverview,
    queryFn: async () => unwrap(await supabase.from("egg_type_overview").select("*").order("id")),
  });
}

export type StockHistoryMovement = {
  id: number;
  kind: "load" | "adjustment";
  eggs: number;
  packs: number | null;
  note: string | null;
  created_at: string;
  egg_types: { name: string };
};

/**
 * Spec 011, RF-10, RF-12: the "Historial de stock", the last 50 loads and adjustments of every type
 * (archived ones too: the admin reads every type), newest first and the latest registered first on the
 * same instant, with the current name of the type. Sales are left out.
 */
export function useStockHistory() {
  return useQuery({
    queryKey: catalogKeys.stockHistory,
    queryFn: async () => {
      const rows = unwrap(
        await supabase
          .from("stock_movements")
          .select("id, kind, eggs, packs, note, created_at, egg_types(name)")
          .in("kind", ["load", "adjustment"])
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(50),
      );
      // The base already leaves sales out (the "in" above): this only narrows the kind for TypeScript.
      return (rows ?? []).filter((row): row is StockHistoryMovement => row.kind !== "sale");
    },
  });
}

// Mutations: each one refreshes what it changes; on error it refreshes nothing.

function useCatalogMutation<V>(write: (variables: V) => Promise<unknown>, refresh: (variables: V) => QueryKey[]) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: write,
    onSuccess: async (_data, variables) => {
      await Promise.all(refresh(variables).map((queryKey) => queryClient.invalidateQueries({ queryKey })));
    },
  });
}

export type TypeInput = { id?: number; name: string; active: boolean };

export function useSaveType() {
  return useCatalogMutation(
    async ({ id, ...fields }: TypeInput) =>
      unwrap(
        await (id === undefined
          ? supabase.from("egg_types").insert(fields)
          : supabase.from("egg_types").update(fields).eq("id", id)),
      ),
    () => [catalogKeys.eggTypes, catalogKeys.productOverview, catalogKeys.shopProducts],
  );
}

export type FormatInput = { id?: number; name: string; eggs: number; active: boolean };

export function useSaveFormat() {
  return useCatalogMutation(
    async ({ id, ...fields }: FormatInput) =>
      unwrap(
        await (id === undefined
          ? supabase.from("formats").insert(fields)
          : supabase.from("formats").update(fields).eq("id", id)),
      ),
    () => [catalogKeys.formats, catalogKeys.productOverview, catalogKeys.shopProducts],
  );
}

export type ProductInput = {
  id?: number;
  egg_type_id: number;
  format_id: number;
  name: string;
  description: string | null;
  price: number;
  active: boolean;
};

export function useSaveProduct() {
  return useCatalogMutation(
    // RF-14: an update never sends the type or the format (the base would reject them anyway).
    async ({ id, egg_type_id, format_id, ...fields }: ProductInput) =>
      unwrap(
        await (id === undefined
          ? supabase.from("products").insert({ ...fields, egg_type_id, format_id })
          : supabase.from("products").update(fields).eq("id", id)),
      ),
    () => [catalogKeys.productOverview, catalogKeys.shopProducts],
  );
}

const stockRefresh = () => [
  catalogKeys.eggTypes,
  catalogKeys.stockOverview,
  catalogKeys.stockHistory,
  catalogKeys.productOverview,
  catalogKeys.shopProducts,
];

export type LoadInput = { eggTypeId: number; packs: number; note: string | null };

/** RF-18: returns the new stock of the type. */
export function useLoadStock() {
  return useCatalogMutation(
    async ({ eggTypeId, packs, note }: LoadInput) =>
      unwrap(await supabase.rpc("load_stock", { p_egg_type_id: eggTypeId, p_packs: packs, p_note: note ?? undefined })),
    stockRefresh,
  );
}

export type AdjustmentInput = { eggTypeId: number; eggs: number; reason: string };

/** RF-19, RF-20: returns the new stock; fails with insufficient_stock (current stock in the hint). */
export function useAdjustStock() {
  return useCatalogMutation(
    async ({ eggTypeId, eggs, reason }: AdjustmentInput) =>
      unwrap(await supabase.rpc("adjust_stock", { p_egg_type_id: eggTypeId, p_eggs: eggs, p_reason: reason })),
    stockRefresh,
  );
}

// Cambio del RF-34 (2026-11-18): "Eliminar" archives through the RPC, which check the blocks (RF-45 to
// RF-49). Each one refreshes the lists the archived row leaves.

export function useArchiveProduct() {
  return useCatalogMutation(
    async (id: number) => unwrap(await supabase.rpc("archive_product", { p_product_id: id })),
    () => [catalogKeys.productOverview, catalogKeys.shopProducts],
  );
}

export function useArchiveEggType() {
  return useCatalogMutation(
    async (id: number) => unwrap(await supabase.rpc("archive_egg_type", { p_egg_type_id: id })),
    () => [catalogKeys.eggTypes, catalogKeys.stockOverview, catalogKeys.productOverview, catalogKeys.shopProducts],
  );
}

export function useArchiveFormat() {
  return useCatalogMutation(
    async (id: number) => unwrap(await supabase.rpc("archive_format", { p_format_id: id })),
    () => [catalogKeys.formats, catalogKeys.productOverview, catalogKeys.shopProducts],
  );
}

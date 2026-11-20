import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";

import { useUpdateProfile } from "@/lib/profile";

// Spec 010 · T2: saving the profile of "Editar perfil" (RF-25, RF-28). The Supabase client is replaced
// with a recorder and the session with a fake that keeps the profile and records setProfile.
type Call = [string, string, unknown[]];
let mockCalls: Call[] = [];
let mockResult: { data: unknown; error: unknown } = { data: null, error: null };

jest.mock("@/lib/supabase", () => {
  function builder(target: string) {
    const chain: Record<string, unknown> = {};
    for (const method of ["update", "eq", "select", "single"]) {
      chain[method] = (...args: unknown[]) => {
        mockCalls.push([target, method, args]);
        return chain;
      };
    }
    chain.then = (resolve: (value: unknown) => unknown) => resolve(mockResult);
    return chain;
  }
  return { supabase: { from: (table: string) => builder(table) } };
});

const ANA = {
  id: "00000000-0000-0000-0000-0000000000a1",
  first_name: "Ana",
  last_name: "Pérez",
  phone: "1133445566",
  address: "Calle 1",
  address_notes: null,
  role: "client",
};
const mockSetProfile = jest.fn();
jest.mock("@/lib/session", () => ({ useSession: () => ({ profile: ANA, setProfile: mockSetProfile }) }));

const DATA = { first_name: "Anabel", last_name: "Pérez", phone: "1133445566", address: "Calle 2", address_notes: "Timbre B" };

let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  mockCalls = [];
  mockResult = { data: null, error: null };
  jest.clearAllMocks();
  client = new QueryClient({ defaultOptions: { mutations: { retry: false, gcTime: Infinity } } });
});

afterEach(() => client.clear());

describe("useUpdateProfile", () => {
  test("RF-25: updates only the five columns of the own row and returns what the base stored", async () => {
    const saved = { ...ANA, ...DATA };
    mockResult = { data: saved, error: null };
    const { result } = await renderHook(useUpdateProfile, { wrapper });
    let returned: unknown;
    await act(async () => {
      returned = await result.current.mutateAsync(DATA);
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockCalls).toEqual([
      ["profiles", "update", [DATA]],
      ["profiles", "eq", ["id", ANA.id]],
      ["profiles", "select", []],
      ["profiles", "single", []],
    ]);
    expect(returned).toEqual(saved);
  });

  test("RF-25: the session gets the row the base returned (normalized by its trigger)", async () => {
    const saved = { ...ANA, ...DATA, phone: "1199887766" };
    mockResult = { data: saved, error: null };
    const { result } = await renderHook(useUpdateProfile, { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ ...DATA, phone: "1199887766" });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockSetProfile).toHaveBeenCalledWith(saved);
  });

  test("spec 011, RF-18: an empty contact of the admin goes to the base as null", async () => {
    const empty = { first_name: "Mateo", last_name: "Admin", phone: null, address: null, address_notes: null };
    mockResult = { data: { ...ANA, ...empty, role: "admin" }, error: null };
    const { result } = await renderHook(useUpdateProfile, { wrapper });
    await act(async () => {
      await result.current.mutateAsync(empty);
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockCalls[0]).toEqual(["profiles", "update", [empty]]);
  });

  test("RF-28: an error reaches the screen and the session keeps its profile", async () => {
    const error = { code: "", message: "TypeError: Network request failed" };
    mockResult = { data: null, error };
    const { result } = await renderHook(useUpdateProfile, { wrapper });
    await act(async () => {
      result.current.mutate(DATA);
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(error);
    expect(mockSetProfile).not.toHaveBeenCalled();
  });
});

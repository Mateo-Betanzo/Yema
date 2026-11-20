import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";

import History from "@/app/client/history";
import { clientOrderKeys } from "@/lib/client-orders";
import { theme } from "@/theme";

// Spec 010 · T6: "Historial de compras", opened from the menu of the Perfil (RF-21, RF-22). The history
// of spec 006 (RF-18 to RF-21) on its own screen. The query is the real one (useClientOrders) and only
// client_orders() is replaced, so invalidating clientOrderKeys.all (what the Realtime of the Home does)
// refreshes this screen too. Only Date is faked: "now" is Friday 13 November 2026 at 12:00 in Buenos
// Aires, so "Hoy" and "Ayer" never depend on when the tests run.
const NOW = new Date("2026-11-13T15:00:00Z");
const HOUR = 60 * 60 * 1000;
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

beforeAll(() => {
  jest.useFakeTimers({
    now: NOW,
    doNotFake: [
      "hrtime",
      "nextTick",
      "performance",
      "queueMicrotask",
      "requestAnimationFrame",
      "cancelAnimationFrame",
      "requestIdleCallback",
      "cancelIdleCallback",
      "setImmediate",
      "clearImmediate",
      "setInterval",
      "clearInterval",
      "setTimeout",
      "clearTimeout",
    ],
  });
});
afterAll(() => jest.useRealTimers());

const item = (product_id: number, name: string, quantity = 1) => ({
  product_id,
  name,
  egg_type_name: name.split(" ")[1] ?? name,
  format_name: name.split(" ")[0],
  quantity,
  unit_price: 5000,
});
const order = (fields: Record<string, unknown>) => ({
  id: 1,
  status: "delivered",
  status_reason: null,
  cancelled_by: null,
  delivery_date: "2026-11-10",
  slot_starts_at: "09:00:00",
  slot_ends_at: "11:00:00",
  total: 10000,
  address: "Calle 1",
  address_notes: null,
  created_at: ago(30 * HOUR),
  accepted_at: null,
  on_the_way_at: null,
  delivered_at: null,
  rejected_at: null,
  cancelled_at: null,
  units: 2,
  items: [item(1, "Maple Medianos", 2)],
  ...fields,
});

const DELIVERED = order({ id: 150, delivered_at: ago(2 * HOUR), items: [item(1, "Maple Medianos", 2), item(2, "Pack Grandes")] });
const REJECTED = order({ id: 140, status: "rejected", rejected_at: ago(26 * HOUR), status_reason: "Fuera de zona", total: 5000 });
const ACTIVE = order({ id: 187, status: "on_the_way", accepted_at: ago(HOUR), on_the_way_at: ago(HOUR / 2) });

let mockResult: { data: unknown; error: unknown } = { data: [], error: null };
const mockRpc = jest.fn();
jest.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: (name: string) => {
      mockRpc(name);
      return Promise.resolve(mockResult);
    },
  },
}));

const mockFocusRefreshes: (() => unknown)[] = [];
jest.mock("@/lib/use-refresh-on-focus", () => ({
  useRefreshOnFocus: (refetch: () => unknown) => mockFocusRefreshes.push(refetch),
}));

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  router: { push: (...args: unknown[]) => mockPush(...args), back: () => mockBack() },
}));

let client: QueryClient;

beforeEach(() => {
  mockResult = { data: [ACTIVE, DELIVERED, REJECTED], error: null };
  mockRpc.mockClear();
  mockFocusRefreshes.length = 0;
  mockPush.mockClear();
  mockBack.mockClear();
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
});

afterEach(() => client.clear());

async function renderHistory() {
  const view = await render(
    <QueryClientProvider client={client}>
      <History />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(screen.queryByLabelText("Cargando")).toBeNull());
  return view;
}
const rows = () => screen.queryAllByRole("button", { name: /×/ }).map((row) => row.props.accessibilityLabel);

describe("Historial de compras", () => {
  test("RF-21: a screen titled Historial de compras with back, that goes back to the Perfil", async () => {
    await renderHistory();
    expect(screen.getByRole("header", { name: "Historial de compras" })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Volver" }));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  test("RF-21: the finished orders by day, newest first, one row per order with its summary, status and total", async () => {
    await renderHistory();
    expect(screen.getByRole("header", { name: "Hoy · vie 13 nov" })).toBeOnTheScreen();
    expect(screen.getByRole("header", { name: "Ayer · jue 12 nov" })).toBeOnTheScreen();
    expect(rows()).toEqual(["2 × Maple Medianos y 1 más, Entregado, $10.000", "2 × Maple Medianos, Rechazado, $5.000"]);
    // The active order is not history: it is on the card of the Home.
    expect(screen.queryByText(/En camino/)).toBeNull();
  });

  test("RF-21: the total of an order that was not charged is grey", async () => {
    await renderHistory();
    expect(screen.getByText("$5.000")).toHaveStyle({ color: theme.colors.textSecondary });
  });

  test("RF-21: without finished orders, Todavía no tenés compras", async () => {
    mockResult = { data: [ACTIVE], error: null };
    await renderHistory();
    expect(screen.getByText("Todavía no tenés compras")).toBeOnTheScreen();
    expect(rows()).toEqual([]);
  });

  test("RF-21: a row opens the detail of its order", async () => {
    await renderHistory();
    await fireEvent.press(screen.getByRole("button", { name: /^2 × Maple Medianos, Rechazado/ }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/client/order/[id]", params: { id: "140" } });
  });

  test("while loading, and when it fails, with Reintentar", async () => {
    mockResult = { data: null, error: { code: "", message: "TypeError: Network request failed" } };
    await renderHistory();
    expect(screen.getByText("No pudimos cargar tus compras")).toBeOnTheScreen();

    mockResult = { data: [DELIVERED], error: null };
    await fireEvent.press(screen.getByRole("button", { name: "Reintentar" }));
    await waitFor(() => expect(rows()).toEqual(["2 × Maple Medianos y 1 más, Entregado, $10.000"]));
  });

  test("RF-22: it refreshes when it gains focus again and when it is pulled down", async () => {
    await renderHistory();
    // The fake records the refetch on every render; the screen passes the refetch of its query.
    expect(mockFocusRefreshes.length).toBeGreaterThan(0);
    mockResult = { data: [DELIVERED], error: null };
    await act(async () => {
      await mockFocusRefreshes[mockFocusRefreshes.length - 1]();
    });
    await waitFor(() => expect(rows()).toHaveLength(1));

    mockResult = { data: [DELIVERED, REJECTED], error: null };
    await act(async () => {
      screen.getByTestId("keyboard-scroll").props.refreshControl.props.onRefresh();
    });
    await waitFor(() => expect(rows()).toHaveLength(2));
  });

  test("RF-22: an order that finishes while the screen is open shows up when the Realtime of the Home invalidates the orders", async () => {
    mockResult = { data: [ACTIVE, REJECTED], error: null };
    await renderHistory();
    expect(within(screen.getByTestId("keyboard-scroll")).queryByText(/Entregado/)).toBeNull();

    mockResult = { data: [order({ ...ACTIVE, status: "delivered", delivered_at: ago(HOUR / 4) }), REJECTED], error: null };
    await act(async () => {
      await client.invalidateQueries({ queryKey: clientOrderKeys.all });
    });
    await waitFor(() => expect(rows()).toEqual(["2 × Maple Medianos, Entregado, $10.000", "2 × Maple Medianos, Rechazado, $5.000"]));
  });
});

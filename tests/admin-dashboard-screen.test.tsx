import { act, fireEvent, render, screen, within } from "@testing-library/react-native";

import Dashboard from "@/app/admin/(tabs)/dashboard";
import { toBuenosAiresDate } from "@/logic/dates";

// Spec 007 · T8: the Dashboard of the admin (RF-5 to RF-19). The hooks are replaced; what to show comes
// from the real components and pure functions.
type Query<T> = { data: T | undefined; isPending: boolean; isError: boolean; isRefetching: boolean; refetch: jest.Mock };
const query = <T,>(data: T): Query<T> => ({ data, isPending: false, isError: false, isRefetching: false, refetch: jest.fn() });

const TOTALS = { income_today: 10000, delivered_today: 1, to_deliver: 2, income_week: 128450, income_month: 512300 };
const SALES = [
  { egg_type_id: 1, name: "Medianos", active: true, eggs_week: 240, eggs_month: 390, eggs_year: 900 },
  { egg_type_id: 2, name: "Grandes", active: true, eggs_week: 90, eggs_month: 195, eggs_year: 1800 },
];
const STOCK = [
  { id: 1, name: "Medianos", active: true, stock: 3000 },
  { id: 2, name: "Grandes", active: true, stock: 4200 },
];
const finished = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60 * 1000).toISOString();
const order = (fields: Record<string, unknown>) => ({
  status: "delivered",
  total: 10500,
  address: "Calle 1",
  client_first_name: "Ana",
  client_last_name: "Pérez",
  items: [{ name: "Maple Grandes", quantity: 2, unit_price: 5000 }],
  delivered_at: finished(30),
  rejected_at: null,
  cancelled_at: null,
  ...fields,
});
const HISTORY = [
  order({ id: 187, client_first_name: "Rocío", client_last_name: "Fernández", address: "Av. Rivadavia 4521" }),
  order({ id: 185, status: "rejected", total: 5000, delivered_at: null, rejected_at: finished(60) }),
];

const mockTotals: { current: Query<typeof TOTALS> } = { current: query(TOTALS) };
const mockSales: { current: Query<typeof SALES> } = { current: query(SALES) };
const mockStock: { current: Query<typeof STOCK> } = { current: query(STOCK) };
const mockHistory: { current: Query<unknown[]> } = { current: query<unknown[]>(HISTORY) };
const mockRealtime = jest.fn();
const mockFocusRefreshes: unknown[] = [];
const mockPush = jest.fn();

jest.mock("@/lib/admin-orders", () => ({
  adminOrderKeys: { all: ["admin-orders"] },
  useAdminTotals: () => mockTotals.current,
  useSalesByType: () => mockSales.current,
  useOrderHistory: () => mockHistory.current,
}));
jest.mock("@/lib/catalog", () => ({
  catalogKeys: { stockOverview: ["stock-overview"] },
  useStockOverview: () => mockStock.current,
}));
jest.mock("@/lib/orders", () => ({
  useOrdersRealtime: (...args: unknown[]) => mockRealtime(...args),
}));
jest.mock("@/lib/use-refresh-on-focus", () => ({
  useRefreshOnFocus: (refetch: unknown) => mockFocusRefreshes.push(refetch),
}));
const mockFocused = { current: true };
jest.mock("expo-router", () => ({
  router: { push: (...args: unknown[]) => mockPush(...args), back: jest.fn() },
  useIsFocused: () => mockFocused.current,
}));

// Spec 012: the summary of the day (its hook is tested in daily-summary-hook.test.tsx); the card is the real one.
type SummaryCard = import("@/lib/daily-summary").DailySummaryCard;
const mockSummary: { card: SummaryCard; facts: unknown[]; refresh: jest.Mock; retry: jest.Mock } = {
  card: { kind: "waiting" },
  facts: [],
  refresh: jest.fn(),
  retry: jest.fn(),
};
jest.mock("@/lib/daily-summary", () => ({
  useDailySummary: (facts: unknown) => {
    mockSummary.facts.push(facts);
    return { card: mockSummary.card, refresh: mockSummary.refresh, retry: mockSummary.retry };
  },
}));

beforeEach(() => {
  mockTotals.current = query(TOTALS);
  mockSales.current = query(SALES);
  mockStock.current = query(STOCK);
  mockHistory.current = query<unknown[]>(HISTORY);
  mockRealtime.mockClear();
  mockFocusRefreshes.length = 0;
  mockPush.mockClear();
  mockSummary.card = { kind: "waiting" };
  mockFocused.current = true;
  mockSummary.facts.length = 0;
  mockSummary.refresh.mockClear();
  mockSummary.retry.mockClear();
});

async function openHistory() {
  await render(<Dashboard />);
  await fireEvent.press(screen.getByRole("tab", { name: "Historial" }));
}

describe("Dashboard · Resumen", () => {
  test("RF-5, RF-6: opens on Resumen, with the income of this week and this month", async () => {
    await render(<Dashboard />);
    expect(screen.getByRole("header", { name: "Dashboard" })).toBeOnTheScreen();
    expect(screen.getByRole("tab", { name: "Resumen" })).toBeSelected();
    expect(screen.getByLabelText("Esta semana, $128.450")).toBeOnTheScreen();
    expect(screen.getByLabelText("Este mes, $512.300")).toBeOnTheScreen();
  });

  test("RF-7, RF-8: Ventas por tipo opens on Mes", async () => {
    await render(<Dashboard />);
    expect(screen.getByText("Maples y packs vendidos este mes")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Mes" })).toBeSelected();
    expect(screen.getByLabelText("Medianos, 13 maples, 2 packs, más vendido")).toBeOnTheScreen();
  });

  test("RF-9: another period changes the bars without asking again, and leaves the cards", async () => {
    await render(<Dashboard />);
    await fireEvent.press(screen.getByRole("button", { name: "Año" }));
    expect(screen.getByText("Maples y packs vendidos este año")).toBeOnTheScreen();
    expect(screen.getByLabelText("Grandes, 60 maples, 10 packs, más vendido")).toBeOnTheScreen();
    expect(screen.getByLabelText("Este mes, $512.300")).toBeOnTheScreen();
    expect(mockSales.current.refetch).not.toHaveBeenCalled();
  });

  test("RF-13: the inventory of each active type", async () => {
    await render(<Dashboard />);
    expect(screen.getByRole("header", { name: "Inventario" })).toBeOnTheScreen();
    expect(screen.getByLabelText("Grandes, 140 maples, 23 packs")).toBeOnTheScreen();
  });

  test("while loading, and when it fails, with retry", async () => {
    mockSales.current = { ...mockSales.current, data: undefined, isPending: true };
    const view = await render(<Dashboard />);
    expect(screen.getByLabelText("Cargando")).toBeOnTheScreen();

    mockSales.current = { ...mockSales.current, isPending: false, isError: true };
    await view.rerender(<Dashboard />);
    expect(screen.getByText("No pudimos cargar el resumen")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Reintentar" }));
    expect(mockTotals.current.refetch).toHaveBeenCalled();
    expect(mockSales.current.refetch).toHaveBeenCalled();
    expect(mockStock.current.refetch).toHaveBeenCalled();
  });
});

describe("Dashboard · Historial", () => {
  test("RF-14, RF-15: every finished order by day, with its summary, client, status and total", async () => {
    await openHistory();
    expect(screen.getByRole("tab", { name: "Historial" })).toBeSelected();
    const history = screen.getByTestId("history");
    // The newest order ended 30 minutes ago: "Hoy", or "Ayer" between 0:00 and 0:30 in Buenos Aires.
    const day = toBuenosAiresDate(new Date(finished(30))) === toBuenosAiresDate(new Date()) ? /^Hoy · / : /^Ayer · /;
    expect(within(history).getAllByRole("header")[0]).toHaveTextContent(day);
    expect(within(history).getAllByRole("button").map((row) => row.props.accessibilityLabel)).toEqual([
      "2 × Maple Grandes, Rocío Fernández, Entregado, $10.500",
      "2 × Maple Grandes, Ana Pérez, Rechazado, $5.000",
    ]);
  });

  test("RF-16: the search finds by client, number or address, without accents", async () => {
    await openHistory();
    const search = screen.getByLabelText("Buscar pedidos");
    await fireEvent.changeText(search, "rocio");
    expect(screen.getAllByRole("button", { name: /^2 × Maple Grandes/ })).toHaveLength(1);
    expect(screen.getByRole("button", { name: /Rocío Fernández/ })).toBeOnTheScreen();
    await fireEvent.changeText(search, "#185");
    expect(screen.getByRole("button", { name: /Ana Pérez/ })).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: /Rocío/ })).toBeNull();
    await fireEvent.changeText(search, "rivadavia");
    expect(screen.getByRole("button", { name: /Rocío Fernández/ })).toBeOnTheScreen();
  });

  test("RF-17: a search that finds nothing, and no finished orders at all", async () => {
    await openHistory();
    await fireEvent.changeText(screen.getByLabelText("Buscar pedidos"), " zzz ");
    expect(screen.getByText("No hay pedidos para «zzz»")).toBeOnTheScreen();

    mockHistory.current = query<unknown[]>([]);
    await fireEvent.changeText(screen.getByLabelText("Buscar pedidos"), "");
    expect(screen.getByText("Todavía no hay pedidos terminados")).toBeOnTheScreen();
  });

  test("spec 008, RF-15, RF-16: a counter sale reads Venta en el local with its name, and is found by it", async () => {
    const sale = order({
      id: 212,
      counter_sale: true,
      customer_name: "Juan Gómez",
      client_first_name: null,
      client_last_name: null,
      address: null,
      delivered_at: finished(5),
    });
    mockHistory.current = query<unknown[]>([...HISTORY, sale]);
    await openHistory();
    expect(screen.getByRole("button", { name: "2 × Maple Grandes, Venta en el local · Juan Gómez, Entregado, $10.500" })).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText("Buscar pedidos"), "juan");
    expect(screen.getAllByRole("button", { name: /^2 × Maple Grandes/ })).toHaveLength(1);
  });

  test("RF-18: a row opens the detail of its order", async () => {
    await openHistory();
    await fireEvent.press(screen.getByRole("button", { name: /Ana Pérez/ }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/admin/order/[id]", params: { id: "185" } });
  });

  test("while loading, and when it fails, with retry", async () => {
    mockHistory.current = { ...mockHistory.current, data: undefined, isPending: true };
    const view = await render(<Dashboard />);
    await fireEvent.press(screen.getByRole("tab", { name: "Historial" }));
    expect(screen.getByLabelText("Cargando")).toBeOnTheScreen();

    mockHistory.current = { ...mockHistory.current, isPending: false, isError: true };
    await view.rerender(<Dashboard />);
    expect(screen.getByText("No pudimos cargar el historial")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Reintentar" }));
    expect(mockHistory.current.refetch).toHaveBeenCalled();
  });
});

describe("Dashboard · actualización", () => {
  test("RF-19: listens to the orders through Realtime, also for the stock a delivery moves", async () => {
    await render(<Dashboard />);
    expect(mockRealtime).toHaveBeenCalledWith("admin-dashboard", [["admin-orders"], ["stock-overview"]]);
  });

  test("RF-19: everything refreshes when the tab gains focus again and when the screen is pulled down", async () => {
    await render(<Dashboard />);
    for (const q of [mockTotals, mockSales, mockStock, mockHistory]) {
      expect(mockFocusRefreshes).toContain(q.current.refetch);
    }
    screen.getByTestId("keyboard-scroll").props.refreshControl.props.onRefresh();
    for (const q of [mockTotals, mockSales, mockStock, mockHistory]) {
      expect(q.current.refetch).toHaveBeenCalled();
    }
  });
});

describe("Dashboard · Resumen del día (spec 012)", () => {
  const SUMMARY = "Se entregó 1 pedido por $10.000 y quedaron 2 por entregar.";

  test("RF-1: the card sits above Esta semana and Este mes, in Resumen", async () => {
    mockSummary.card = { kind: "today", text: SUMMARY, updating: false, updateFailed: false };
    await render(<Dashboard />);
    expect(screen.getAllByText(/^(Resumen del día|Esta semana|Este mes)$/).map((node) => node.props.children)).toEqual([
      "Resumen del día",
      "Esta semana",
      "Este mes",
    ]);
    expect(screen.getByText(SUMMARY)).toBeOnTheScreen();
  });

  test("RF-1: Historial does not show it", async () => {
    await openHistory();
    expect(screen.queryByTestId("ai-summary-card")).toBeNull();
  });

  test("RF-6: the summary gets the facts of the day from what the Dashboard already loaded", async () => {
    await render(<Dashboard />);
    expect(mockSummary.facts[mockSummary.facts.length - 1]).toEqual({
      incomeToday: "$10.000",
      deliveredToday: 1,
      toDeliver: 2,
      bestSellersWeek: ["Medianos"],
      lowStock: [],
      shortfalls: [],
    });
  });

  test("RF-12: while the totals, the sales or the stock load, it gets no facts", async () => {
    mockStock.current = { ...query(STOCK), data: undefined, isPending: true };
    await render(<Dashboard />);
    expect(mockSummary.facts[mockSummary.facts.length - 1]).toBeNull();
  });

  test("RF-18: while the AI works, the income, the sales and the inventory are already there", async () => {
    mockSummary.card = { kind: "loading" };
    await render(<Dashboard />);
    expect(screen.getByText("Armando el resumen…")).toBeOnTheScreen();
    expect(screen.getByLabelText("Esta semana, $128.450")).toBeOnTheScreen();
    expect(screen.getByText("Maples y packs vendidos este mes")).toBeOnTheScreen();
  });

  test("RF-18: the card does not wait for the rest of the Resumen either", async () => {
    mockTotals.current = { ...query(TOTALS), data: undefined, isPending: true };
    await render(<Dashboard />);
    expect(screen.getByTestId("ai-summary-card")).toBeOnTheScreen();
  });

  test("RF-15: pulling the Dashboard down also asks to make the summary again", async () => {
    await render(<Dashboard />);
    await act(async () => screen.getByTestId("keyboard-scroll").props.refreshControl.props.onRefresh());
    expect(mockSummary.refresh).toHaveBeenCalledTimes(1);
  });

  test("RF-19: while it is made again, the pull-down indicator keeps spinning", async () => {
    mockSummary.card = { kind: "today", text: SUMMARY, updating: true, updateFailed: false };
    await render(<Dashboard />);
    expect(screen.getByTestId("keyboard-scroll").props.refreshControl.props.refreshing).toBe(true);
  });

  test("RF-22: Reintentar of the card asks again", async () => {
    mockSummary.card = { kind: "error" };
    await render(<Dashboard />);
    await fireEvent.press(screen.getByRole("button", { name: "Reintentar" }));
    expect(mockSummary.retry).toHaveBeenCalledTimes(1);
  });

  test("the border of the card pauses while another tab is on screen (impeccable audit)", async () => {
    mockSummary.card = { kind: "today", text: SUMMARY, updating: false, updateFailed: false };
    mockFocused.current = false;
    await render(<Dashboard />);
    const glow = screen.getByTestId("ai-summary-glow", { includeHiddenElements: true });
    expect(Object.assign({}, ...[glow.props.style].flat(Infinity).filter(Boolean)).animationPlayState).toBe("paused");
  });

  test("RF-16: the Realtime of the orders does not make the summary again", async () => {
    await render(<Dashboard />);
    const [, keys] = mockRealtime.mock.calls[0] as [string, unknown[][]];
    expect(keys).toEqual([["admin-orders"], ["stock-overview"]]);
    expect(mockSummary.refresh).not.toHaveBeenCalled();
  });
});

import { fireEvent, render, screen, within } from "@testing-library/react-native";

import StockHistory from "@/app/admin/stock-history";

// Spec 011 · T6: the "Historial de stock" of the admin, opened from the menu of the Perfil (RF-10 to
// RF-15). The query is replaced (its filters, order and limit are tested in catalog-hooks.test.tsx). Only
// Date is faked: "now" is Thursday 19 November 2026 at 12:00 in Buenos Aires, so "Hoy" and "Ayer" never
// depend on when the tests run.
const NOW = new Date("2026-11-19T15:00:00Z");

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

const MOVEMENTS = [
  // Today, 11:32 in Buenos Aires.
  { id: 9, kind: "load", eggs: 1080, packs: 6, note: "Proveedor de la mañana", created_at: "2026-11-19T14:32:00Z", egg_types: { name: "Medianos" } },
  // Yesterday, 23:30 in Buenos Aires (already Thursday in UTC).
  { id: 8, kind: "adjustment", eggs: 12, packs: null, note: "Rotos en el reparto", created_at: "2026-11-19T02:30:00Z", egg_types: { name: "Super" } },
  // An archived type keeps its name in the history.
  { id: 7, kind: "load", eggs: 180, packs: 1, note: null, created_at: "2026-11-18T12:05:00Z", egg_types: { name: "Cajitas" } },
  { id: 6, kind: "adjustment", eggs: 1, packs: null, note: "Conteo", created_at: "2026-11-10T13:00:00Z", egg_types: { name: "Grandes" } },
];

type History = { data: unknown[] | undefined; isPending: boolean; isError: boolean; isRefetching: boolean; refetch: jest.Mock };
const history = (fields: Partial<History> = {}): History => ({
  data: MOVEMENTS,
  isPending: false,
  isError: false,
  isRefetching: false,
  refetch: jest.fn(),
  ...fields,
});
const mockHistory: { current: History } = { current: history() };

jest.mock("@/lib/catalog", () => ({ useStockHistory: () => mockHistory.current }));
jest.mock("expo-router", () => ({ router: { back: jest.fn() } }));

beforeEach(() => {
  mockHistory.current = history();
});

describe("Historial de stock", () => {
  test("RF-10: the screen is titled Historial de stock and has a back button", async () => {
    await render(<StockHistory />);
    expect(screen.getByRole("header", { name: "Historial de stock" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Volver" })).toBeOnTheScreen();
  });

  test("RF-11: the movements by Buenos Aires day, with Hoy, Ayer or the date as headers", async () => {
    await render(<StockHistory />);
    const days = screen.getAllByRole("header").map((node) => node.props.children);
    expect(days).toEqual(["Historial de stock", "Hoy · jue 19 nov", "Ayer · mié 18 nov", "mar 10 nov"]);
  });

  test("RF-10, RF-12: newest first, each with the type, the movement, the time and the note", async () => {
    await render(<StockHistory />);
    const texts = screen.getAllByText(/^(Carga|Ajuste) · /).map((node) => node.props.children);
    expect(texts).toEqual([
      "Carga · +1.080 huevos (6 packs)",
      "Ajuste · −12 huevos",
      "Carga · +180 huevos (1 pack)",
      "Ajuste · −1 huevo",
    ]);
    const first = within(screen.getByTestId("movement-9"));
    expect(first.getByText("Medianos")).toBeOnTheScreen();
    expect(first.getByText("11:32")).toBeOnTheScreen();
    expect(first.getByText("Proveedor de la mañana")).toBeOnTheScreen();
    const lateYesterday = within(screen.getByTestId("movement-8"));
    expect(lateYesterday.getByText("Super")).toBeOnTheScreen();
    expect(lateYesterday.getByText("23:30")).toBeOnTheScreen();
    expect(lateYesterday.getByText("Rotos en el reparto")).toBeOnTheScreen();
  });

  test("RF-12: a load without a note shows no note line; an archived type keeps its name", async () => {
    await render(<StockHistory />);
    const row = within(screen.getByTestId("movement-7"));
    expect(row.getByText("Cajitas")).toBeOnTheScreen();
    expect(row.getAllByText(/./).map((node) => node.props.children)).toEqual([
      "Cajitas",
      "Carga · +180 huevos (1 pack)",
      "09:05",
    ]);
  });

  test("each movement is one element for the screen reader (impeccable audit)", async () => {
    await render(<StockHistory />);
    expect(screen.getByTestId("movement-9")).toHaveProp("accessible", true);
  });

  test("RF-13: without loads or adjustments, it says so", async () => {
    mockHistory.current = history({ data: [] });
    await render(<StockHistory />);
    expect(screen.getByText("Todavía no hay cargas ni ajustes")).toBeOnTheScreen();
  });

  test("while loading, it shows that it is loading", async () => {
    mockHistory.current = history({ data: undefined, isPending: true });
    await render(<StockHistory />);
    expect(screen.getByLabelText("Cargando")).toBeOnTheScreen();
  });

  test("RF-14: when it fails, it says so and can be retried", async () => {
    const refetch = jest.fn();
    mockHistory.current = history({ data: undefined, isError: true, refetch });
    await render(<StockHistory />);
    expect(screen.getByText("No pudimos cargar el historial")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Reintentar" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  test("RF-15: pulling it down asks again", async () => {
    const refetch = jest.fn();
    mockHistory.current = history({ refetch });
    await render(<StockHistory />);
    screen.getByTestId("keyboard-scroll").props.refreshControl.props.onRefresh();
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  test("RF-10: movements are only shown: nothing to edit or delete", async () => {
    await render(<StockHistory />);
    expect(screen.getAllByRole("button").map((node) => node.props.accessibilityLabel)).toEqual(["Volver"]);
  });
});

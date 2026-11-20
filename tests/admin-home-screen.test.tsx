import { fireEvent, render, screen, within } from "@testing-library/react-native";

import AdminHome from "@/app/admin/(tabs)/index";
import { addDays, formatDayKey, toBuenosAiresDate } from "@/logic/dates";
import { theme } from "@/theme";

// Spec 005 · T6: the admin Home (RF-1 to RF-6, RF-20, RF-24, RF-25). The hooks are replaced; the
// sections come from the real groupAdminOrders, with days relative to the real date.
const today = toBuenosAiresDate(new Date());
const day = (offset: number) => addDays(today, offset);

const order = (fields: Record<string, unknown>) => ({
  status: "pending",
  delivery_date: day(1),
  slot_starts_at: "09:00:00",
  slot_ends_at: "11:00:00",
  created_at: "2026-11-01T12:00:00Z",
  client_first_name: "Rocío",
  client_last_name: "Fernández",
  units: 5,
  total: 9800,
  ...fields,
});
const ORDERS = [
  order({ id: 187 }),
  order({ id: 185, delivery_date: day(-1), slot_starts_at: "18:00:00", slot_ends_at: "21:00:00", client_first_name: "Juan", client_last_name: "Pérez", units: 1, total: 4000 }),
  order({ id: 190, status: "on_the_way", delivery_date: day(0), client_first_name: "Ana", units: 2, total: 2400 }),
  order({ id: 170, status: "accepted", delivery_date: day(-2), client_first_name: "Beto", units: 1, total: 1200 }),
  order({ id: 180, status: "accepted", delivery_date: day(3), client_first_name: "Ana", client_last_name: "Ruiz", units: 1, total: 10500 }),
];

type ListQuery = { data: unknown[] | undefined; isPending: boolean; isError: boolean; isRefetching: boolean; refetch: jest.Mock };
const mockList: { current: ListQuery } = {
  current: { data: ORDERS, isPending: false, isError: false, isRefetching: false, refetch: jest.fn() },
};
const TOTALS = { income_today: 100300, delivered_today: 40, to_deliver: 5, income_week: 128450, income_month: 512300 };
type TotalsQuery = { data: typeof TOTALS | null | undefined; isPending: boolean; isError: boolean; refetch: jest.Mock };
const mockTotals: { current: TotalsQuery } = {
  current: { data: TOTALS, isPending: false, isError: false, refetch: jest.fn() },
};
const mockRealtime = jest.fn();
const mockFocusRefreshes: unknown[] = [];
const mockPush = jest.fn();

jest.mock("@/lib/admin-orders", () => ({
  adminOrderKeys: { all: ["admin-orders"] },
  useAdminOrders: () => mockList.current,
  useAdminTotals: () => mockTotals.current,
}));
jest.mock("@/lib/orders", () => ({
  useOrdersRealtime: (...args: unknown[]) => mockRealtime(...args),
}));
jest.mock("@/lib/session", () => ({ useSession: () => ({ profile: { first_name: "Mateo" } }) }));
jest.mock("@/lib/use-refresh-on-focus", () => ({
  useRefreshOnFocus: (refetch: unknown) => mockFocusRefreshes.push(refetch),
}));
jest.mock("expo-router", () => ({ router: { push: (...args: unknown[]) => mockPush(...args), back: jest.fn() } }));

beforeEach(() => {
  mockList.current = { data: ORDERS, isPending: false, isError: false, isRefetching: false, refetch: jest.fn() };
  mockTotals.current = { data: TOTALS, isPending: false, isError: false, refetch: jest.fn() };
  mockRealtime.mockClear();
  mockFocusRefreshes.length = 0;
  mockPush.mockClear();
});

const section = (name: RegExp) => screen.getByTestId(`section-${name.source}`);
const rowIds = (name: RegExp) =>
  within(section(name))
    .queryAllByRole("button")
    .map((row) => /#(\d+)/.exec(row.props.accessibilityLabel)?.[1]);

describe("Admin Home", () => {
  test("greets the admin by name", async () => {
    await render(<AdminHome />);
    expect(screen.getByRole("header", { name: "Hola, Mateo" })).toBeOnTheScreen();
  });

  test("RF-1, RF-2, RF-24: Nuevos, Para hoy and Próximos, each in its order, with its count", async () => {
    await render(<AdminHome />);
    expect(screen.getByRole("header", { name: "Nuevos · 2" })).toBeOnTheScreen();
    expect(screen.getByRole("header", { name: "Para hoy · 2" })).toBeOnTheScreen();
    expect(screen.getByRole("header", { name: "Próximos · 1" })).toBeOnTheScreen();
    expect(rowIds(/fresh/)).toEqual(["185", "187"]);
    expect(rowIds(/today/)).toEqual(["170", "190"]);
    expect(rowIds(/upcoming/)).toEqual(["180"]);
  });

  // Cambio del 2026-11-19: one line, as the Figma; the day, the slot and the status are in the detail.
  test("RF-3: each row with its number, short name and total, without the units", async () => {
    await render(<AdminHome />);
    const row = screen.getByRole("button", { name: /^Pedido #187/ });
    expect(within(row).queryByTestId("order-units")).toBeNull();
    expect(within(row).getByText("#187 ·")).toBeOnTheScreen();
    expect(within(row).getByText("Rocío F.")).toBeOnTheScreen();
    expect(within(row).getByText("$9.800")).toBeOnTheScreen();
    expect(within(row).queryByText(new RegExp(formatDayKey(day(1), new Date())))).toBeNull();
    expect(within(row).queryByText("Nuevo")).toBeNull();
  });

  // The card follows the pill: its radius is the row's (half its 48 pt) plus the padding, 24 + 12 = 36, so
  // both curves run parallel; the title sits one padding further in, clear of the corner.
  test("RF-27: each section is a card with its title and rows inside, its corners parallel to the rows", async () => {
    await render(<AdminHome />);
    for (const [id, title] of [["fresh", "Nuevos · 2"], ["today", "Para hoy · 2"], ["upcoming", "Próximos · 1"]]) {
      const card = screen.getByTestId(`section-${id}`);
      expect(card).toHaveStyle({ backgroundColor: theme.colors.surface, padding: 12, borderRadius: 36 });
      expect(within(card).getByRole("header", { name: title })).toHaveStyle({ paddingHorizontal: 12 });
      expect(within(card).getByRole("header", { name: title })).toBeOnTheScreen();
    }
  });

  test("RF-28: the rows take the color of their section", async () => {
    await render(<AdminHome />);
    expect(screen.getByRole("button", { name: /^Pedido #187/ })).toHaveStyle({ backgroundColor: theme.colors.primary });
    expect(screen.getByRole("button", { name: /^Pedido #190/ })).toHaveStyle({ backgroundColor: theme.colors.text });
    expect(screen.getByRole("button", { name: /^Pedido #180/ })).toHaveStyle({ backgroundColor: theme.colors.rowMuted });
  });

  test("RF-25: late and expired orders say so in text", async () => {
    await render(<AdminHome />);
    // Cambio del 2026-11-19: the short mark; the day is in the detail.
    expect(within(screen.getByRole("button", { name: /^Pedido #185/ })).getByText("· Vencido")).toBeOnTheScreen();
    expect(within(screen.getByRole("button", { name: /^Pedido #170/ })).getByText("· Atrasado")).toBeOnTheScreen();
    expect(within(screen.getByRole("button", { name: /^Pedido #190/ })).queryByText(/Atrasado|Vencido/)).toBeNull();
  });

  test("RF-7: a row opens its order", async () => {
    await render(<AdminHome />);
    await fireEvent.press(screen.getByRole("button", { name: /^Pedido #187/ }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/admin/order/[id]", params: { id: "187" } });
  });

  test("RF-4: an empty section says so", async () => {
    mockList.current = { ...mockList.current, data: [] };
    await render(<AdminHome />);
    expect(screen.getByText("No hay pedidos nuevos")).toBeOnTheScreen();
    expect(screen.getByText("No hay entregas para hoy")).toBeOnTheScreen();
    expect(screen.getByText("No hay pedidos próximos")).toBeOnTheScreen();
  });

  test("RF-5, RF-20: the Home listens to the orders through Realtime", async () => {
    await render(<AdminHome />);
    expect(mockRealtime).toHaveBeenCalledWith("admin-orders", [["admin-orders"]]);
  });

  test("RF-6: the orders refresh when the tab gains focus again and when the list is pulled down", async () => {
    mockList.current = { ...mockList.current, isRefetching: true };
    await render(<AdminHome />);
    expect(mockFocusRefreshes).toContain(mockList.current.refetch);
    const refreshControl = screen.getByTestId("keyboard-scroll").props.refreshControl;
    expect(refreshControl.props.refreshing).toBe(true);
    refreshControl.props.onRefresh();
    expect(mockList.current.refetch).toHaveBeenCalled();
  });

  test("while loading, and when it fails, with retry", async () => {
    mockList.current = { ...mockList.current, data: undefined, isPending: true };
    const view = await render(<AdminHome />);
    expect(screen.getByLabelText("Cargando")).toBeOnTheScreen();

    mockList.current = { ...mockList.current, isPending: false, isError: true };
    await view.rerender(<AdminHome />);
    await fireEvent.press(screen.getByRole("button", { name: "Reintentar" }));
    expect(mockList.current.refetch).toHaveBeenCalled();
  });

  // Spec 007 · T4: the totals above the sections (RF-1 to RF-4).
  test("spec 007, RF-1 to RF-3: Ingresos hoy, Entregados hoy and Falta entregar, above the orders", async () => {
    await render(<AdminHome />);
    expect(screen.getByLabelText("Ingresos hoy, $100.300")).toBeOnTheScreen();
    expect(screen.getByLabelText("Entregados hoy, 40")).toBeOnTheScreen();
    expect(screen.getByLabelText("Falta entregar, 5")).toBeOnTheScreen();
    expect(within(screen.getByTestId("totals")).queryAllByRole("button")).toEqual([]);
  });

  test("spec 007, RF-4: the totals refresh with the orders, on focus and when pulled down (Realtime refreshes both)", async () => {
    await render(<AdminHome />);
    expect(mockFocusRefreshes).toContain(mockTotals.current.refetch);
    screen.getByTestId("keyboard-scroll").props.refreshControl.props.onRefresh();
    expect(mockTotals.current.refetch).toHaveBeenCalled();
    expect(mockList.current.refetch).toHaveBeenCalled();
  });

  test("spec 007: while the totals load, each card is read as loading", async () => {
    mockTotals.current = { ...mockTotals.current, data: undefined, isPending: true };
    await render(<AdminHome />);
    expect(screen.getByLabelText("Ingresos hoy, cargando")).toBeOnTheScreen();
    expect(screen.getByLabelText("Falta entregar, cargando")).toBeOnTheScreen();
  });

  test("spec 007: if the totals fail, they say so with retry and the orders still show", async () => {
    mockTotals.current = { ...mockTotals.current, data: undefined, isError: true };
    await render(<AdminHome />);
    expect(screen.getByText("No pudimos cargar los totales")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Reintentar" }));
    expect(mockTotals.current.refetch).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /^Pedido #187/ })).toBeOnTheScreen();
  });

  // Spec 008 · T4: the way to a counter sale (RF-1).
  test("spec 008, RF-1: Nueva venta is a 48 pt button in the header that opens the counter sale", async () => {
    await render(<AdminHome />);
    const button = screen.getByRole("button", { name: "Nueva venta" });
    expect(button).toHaveStyle({ width: 48, height: 48 });
    await fireEvent.press(button);
    expect(mockPush).toHaveBeenCalledWith("/admin/counter-sale");
  });
});

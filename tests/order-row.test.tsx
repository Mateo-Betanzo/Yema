import { fireEvent, render, screen } from "@testing-library/react-native";

import { OrderRow } from "@/components/order-row";
import type { AppAdminOrder } from "@/lib/admin-orders";
import { theme } from "@/theme";

// Spec 005, cambio del 2026-11-19 · T12: the one-line row of the admin Home, as the Figma (RF-3, RF-25,
// RF-28 to RF-30). "Now" is Friday 13 November 2026 at 12:00 in Buenos Aires.
const NOW = new Date("2026-11-13T15:00:00Z");

const order = (fields: Partial<AppAdminOrder> = {}) =>
  ({
    id: 12,
    status: "pending",
    delivery_date: "2026-11-14",
    slot_starts_at: "09:00:00",
    slot_ends_at: "11:00:00",
    created_at: "2026-11-13T12:00:00Z",
    client_first_name: "Rocío",
    client_last_name: "Fernández",
    units: 3,
    total: 5600,
    ...fields,
  }) as AppAdminOrder;

const row = () => screen.getByRole("button", { name: /^Pedido #12/ });

describe("OrderRow", () => {
  // Without the box of the Figma (the units), by the author's decision of 2026-11-19.
  test("RF-3: one line with the number, the short name and the total, without the units box", async () => {
    await render(<OrderRow order={order()} now={NOW} tone="fresh" onPress={() => {}} />);
    expect(screen.queryByTestId("order-units")).toBeNull();
    expect(screen.queryByText("3")).toBeNull();
    expect(screen.getByText("#12 ·")).toBeOnTheScreen();
    expect(screen.getByText("Rocío F.")).toBeOnTheScreen();
    expect(screen.getByText("$5.600")).toBeOnTheScreen();
  });

  test("RF-3: the units, the day, the slot and the status are not in the row (they are in the detail)", async () => {
    await render(<OrderRow order={order()} now={NOW} tone="fresh" onPress={() => {}} />);
    expect(screen.queryByText(/9 a 11 h|sáb 14 nov|mañana/)).toBeNull();
    expect(screen.queryByText("Nuevo")).toBeNull();
  });

  test("RF-25: a late or expired order says so in its row; the others do not", async () => {
    const view = await render(
      <OrderRow order={order({ status: "accepted", delivery_date: "2026-11-11" })} now={NOW} tone="today" onPress={() => {}} />,
    );
    expect(screen.getByText("· Atrasado")).toBeOnTheScreen();
    await view.rerender(<OrderRow order={order({ slot_ends_at: "11:00:00", delivery_date: "2026-11-13" })} now={NOW} tone="fresh" onPress={() => {}} />);
    expect(screen.getByText("· Vencido")).toBeOnTheScreen();
    await view.rerender(<OrderRow order={order()} now={NOW} tone="fresh" onPress={() => {}} />);
    expect(screen.queryByText(/Atrasado|Vencido/)).toBeNull();
  });

  test("RF-29: only the name is cut, in one line; the number, the mark and the total never", async () => {
    await render(
      <OrderRow
        order={order({ status: "accepted", delivery_date: "2026-11-11", client_first_name: "Ana".repeat(20) })}
        now={NOW}
        tone="today"
        onPress={() => {}}
      />,
    );
    expect(screen.getByText(`${"Ana".repeat(20)} F.`)).toHaveProp("numberOfLines", 1);
    for (const text of ["#12 ·", "· Atrasado", "$5.600"]) {
      expect(screen.getByText(text)).not.toHaveProp("numberOfLines");
    }
  });

  test("RF-30: a screen reader hears the whole order, with the mark", async () => {
    const view = await render(<OrderRow order={order()} now={NOW} tone="fresh" onPress={() => {}} />);
    expect(row()).toHaveProp("accessibilityLabel", "Pedido #12 de Rocío Fernández, 3 productos, $5.600, Nuevo");
    await view.rerender(
      <OrderRow order={order({ status: "accepted", delivery_date: "2026-11-11", units: 1 })} now={NOW} tone="today" onPress={() => {}} />,
    );
    expect(row()).toHaveProp("accessibilityLabel", "Pedido #12 de Rocío Fernández, 1 producto, $5.600, Aceptado, Atrasado");
  });

  test("a pill of at least 48 pt that opens the order", async () => {
    const onPress = jest.fn();
    await render(<OrderRow order={order()} now={NOW} tone="fresh" onPress={onPress} />);
    expect(row()).toHaveStyle({ minHeight: 48, borderRadius: theme.radii.pill });
    await fireEvent.press(row());
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test.each([
    ["fresh", theme.colors.primary, theme.colors.text],
    ["today", theme.colors.text, theme.colors.black],
    ["upcoming", theme.colors.rowMuted, theme.colors.text],
  ] as const)("RF-28: the %s row is %s with %s text", async (tone, background, text) => {
    await render(<OrderRow order={order({ status: "accepted", delivery_date: "2026-11-11" })} now={NOW} tone={tone} onPress={() => {}} />);
    expect(row()).toHaveStyle({ backgroundColor: background });
    for (const label of ["#12 ·", "Rocío F.", "· Atrasado", "$5.600"]) {
      expect(screen.getByText(label)).toHaveStyle({ color: text });
    }
  });
});

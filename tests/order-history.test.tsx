import { fireEvent, render, screen } from "@testing-library/react-native";

import { OrderHistory } from "@/components/order-history";
import { theme } from "@/theme";

// Spec 007 · T7: the history by day, shared by the client Home (spec 006, RF-18 to RF-21) and the
// Dashboard of the admin (RF-14, RF-15, RF-18). Each screen says what a row reads; the total, grey when
// it was not charged, and the day headers are the same for both.
type Row = { id: number; status: "delivered" | "rejected" | "cancelled"; total: number; who: string };
const delivered: Row = { id: 187, status: "delivered", total: 10500, who: "Rocío Fernández" };
const rejected: Row = { id: 185, status: "rejected", total: 5000, who: "Juan Pérez" };
const SECTIONS = [
  { title: "Hoy · vie 13 nov", orders: [delivered] },
  { title: "Ayer · jue 12 nov", orders: [rejected] },
];
const describeRow = (order: Row) => ({ title: `Pedido #${order.id}`, lines: [order.who, order.status] });

describe("order history", () => {
  test("RF-14: a header per day, in order, for the screen reader to jump between days", async () => {
    await render(<OrderHistory sections={SECTIONS} empty="Nada" describe={describeRow} onOpen={() => {}} />);
    expect(screen.getAllByRole("header").map((header) => header.props.children)).toEqual([
      "Hoy · vie 13 nov",
      "Ayer · jue 12 nov",
    ]);
  });

  test("RF-15: each row with what its screen says and its total, inside the button", async () => {
    await render(<OrderHistory sections={SECTIONS} empty="Nada" describe={describeRow} onOpen={() => {}} />);
    expect(screen.getAllByRole("button").map((row) => row.props.accessibilityLabel)).toEqual([
      "Pedido #187, Rocío Fernández, delivered, $10.500",
      "Pedido #185, Juan Pérez, rejected, $5.000",
    ]);
  });

  test("RF-15: the total of an order that was not charged is grey", async () => {
    await render(<OrderHistory sections={SECTIONS} empty="Nada" describe={describeRow} onOpen={() => {}} />);
    expect(screen.getByText("$5.000")).toHaveStyle({ color: theme.colors.textSecondary });
    expect(screen.getByText("$10.500")).toHaveStyle({ color: theme.colors.text });
  });

  test("RF-18: touching a row opens its order", async () => {
    const onOpen = jest.fn();
    await render(<OrderHistory sections={SECTIONS} empty="Nada" describe={describeRow} onOpen={onOpen} />);
    await fireEvent.press(screen.getByRole("button", { name: /^Pedido #185/ }));
    expect(onOpen).toHaveBeenCalledWith(rejected);
  });

  test("no orders: the text of its screen", async () => {
    await render(
      <OrderHistory sections={[]} empty="Todavía no hay pedidos terminados" describe={describeRow} onOpen={() => {}} />,
    );
    expect(screen.getByText("Todavía no hay pedidos terminados")).toBeOnTheScreen();
    expect(screen.queryAllByRole("button")).toEqual([]);
  });
});

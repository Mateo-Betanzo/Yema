import { render, screen } from "@testing-library/react-native";

import { OrderSummary } from "@/components/order-summary";
import { addDays, formatDayKey, toBuenosAiresDate } from "@/logic/dates";

// Spec 006 · T5: the part of an order shared by the detail of the admin (spec 005, RF-7) and of the
// client (RF-22): the address with the day and slot, the numbered lines, payment and total.
const tomorrow = addDays(toBuenosAiresDate(new Date()), 1);
const ORDER = {
  address: "Av. Rivadavia 4521",
  address_notes: "Timbre B",
  delivery_date: tomorrow,
  slot_starts_at: "09:00:00",
  slot_ends_at: "11:00:00",
  total: 9600,
  items: [
    { name: "Maple Grandes", quantity: 3, unit_price: 1800 },
    { name: null, quantity: 6, unit_price: 700 },
  ],
};

describe("order summary", () => {
  test("RF-22: the address, the day and slot, each line with its subtotal, payment and total", async () => {
    await render(<OrderSummary order={ORDER} now={new Date()} />);
    expect(screen.getByText("Av. Rivadavia 4521")).toBeOnTheScreen();
    expect(screen.getByText("Timbre B")).toBeOnTheScreen();
    expect(screen.getByText(`${formatDayKey(tomorrow, new Date())} · 9 a 11 h`)).toBeOnTheScreen();
    expect(screen.getByLabelText("1 · Maple Grandes ×3, $5.400")).toBeOnTheScreen();
    expect(screen.getByText("Paga al recibir")).toBeOnTheScreen();
    expect(screen.getByLabelText("Total $9.600")).toBeOnTheScreen();
  });

  test("a line without a name still reads as a product", async () => {
    await render(<OrderSummary order={ORDER} now={new Date()} />);
    expect(screen.getByText("2 · Producto ×6")).toBeOnTheScreen();
  });

  test("without address notes, no empty line", async () => {
    await render(<OrderSummary order={{ ...ORDER, address_notes: null }} now={new Date()} />);
    expect(screen.queryByText("Timbre B")).toBeNull();
  });

  // Spec 008 · T7: a counter sale has no delivery, and it was paid at the counter (RF-17).
  test("spec 008, RF-17: without a delivery there is no address card, and the payment says so", async () => {
    const sale = { ...ORDER, address: null, address_notes: null, delivery_date: null, slot_starts_at: null, slot_ends_at: null };
    await render(<OrderSummary order={sale} now={new Date()} payment="Pagó en efectivo" />);
    expect(screen.queryByTestId("order-address")).toBeNull();
    expect(screen.queryByText("Paga al recibir")).toBeNull();
    expect(screen.getByText("Pagó en efectivo")).toBeOnTheScreen();
    expect(screen.getByLabelText("1 · Maple Grandes ×3, $5.400")).toBeOnTheScreen();
    expect(screen.getByLabelText("Total $9.600")).toBeOnTheScreen();
  });

  test("an order of the app keeps its address card", async () => {
    await render(<OrderSummary order={ORDER} now={new Date()} />);
    expect(screen.getByTestId("order-address")).toBeOnTheScreen();
  });
});

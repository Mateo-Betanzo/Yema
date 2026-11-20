import { fireEvent, render, screen } from "@testing-library/react-native";

import { ClientOrderCard } from "@/components/client-order-card";
import type { ClientOrder } from "@/lib/client-orders";
import { addDays, formatDayKey, toBuenosAiresDate } from "@/logic/dates";

// Spec 006 · T6: the card of the client Home (RF-2 to RF-4, RF-10 to RF-12, RF-24).
const NOW = new Date();
const tomorrow = addDays(toBuenosAiresDate(NOW), 1);
const ORDER: ClientOrder = {
  id: 187,
  status: "on_the_way",
  status_reason: null,
  cancelled_by: null,
  delivery_date: tomorrow,
  slot_starts_at: "09:00:00",
  slot_ends_at: "11:00:00",
  total: 10500,
  address: "Calle 1",
  address_notes: null,
  created_at: "2026-11-13T12:00:00Z",
  accepted_at: "2026-11-13T12:10:00Z",
  on_the_way_at: "2026-11-13T13:00:00Z",
  delivered_at: null,
  rejected_at: null,
  cancelled_at: null,
  units: 1,
  items: [],
};
const META = `#187 · ${formatDayKey(tomorrow, NOW)} · 9 a 11 h · $10.500`;

const handlers = () => ({ onOpen: jest.fn(), onHide: jest.fn() });

describe("client order card", () => {
  test("RF-2, RF-3: the active order with its title, text, number, day, slot, total and step", async () => {
    await render(<ClientOrderCard card={{ kind: "active", order: ORDER }} now={NOW} {...handlers()} />);
    expect(screen.getByText("Pedido en camino")).toBeOnTheScreen();
    expect(screen.getByText("El repartidor está en camino hacia tu dirección")).toBeOnTheScreen();
    expect(screen.getByText(META)).toBeOnTheScreen();
    expect(
      screen.getByRole("button", {
        name: `Pedido en camino, El repartidor está en camino hacia tu dirección, ${META}, Paso 3 de 4: En camino`,
      }),
    ).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Ocultar" })).toBeNull();
  });

  test("the whole card presses in (scale 0.98), not only its texts", async () => {
    await render(<ClientOrderCard card={{ kind: "active", order: ORDER }} now={NOW} {...handlers()} />);
    const button = screen.getByRole("button", { name: /^Pedido en camino/ });
    await fireEvent(button, "pressIn");
    expect(screen.getByTestId("client-order-card")).toHaveStyle({ transform: [{ scale: 0.98 }] });
    await fireEvent(button, "pressOut");
    expect(screen.getByTestId("client-order-card")).not.toHaveStyle({ transform: [{ scale: 0.98 }] });
  });

  test("RF-4: touching the card opens the order", async () => {
    const props = handlers();
    await render(<ClientOrderCard card={{ kind: "active", order: ORDER }} now={NOW} {...props} />);
    await fireEvent.press(screen.getByRole("button", { name: /^Pedido en camino/ }));
    expect(props.onOpen).toHaveBeenCalledWith(ORDER);
  });

  test("RF-10, RF-11: a delivered order, with the whole timeline and Ocultar (48 pt) apart from the card", async () => {
    const props = handlers();
    const delivered = { ...ORDER, status: "delivered" as const, delivered_at: "2026-11-13T14:00:00Z" };
    await render(<ClientOrderCard card={{ kind: "finished", order: delivered }} now={NOW} {...props} />);
    expect(screen.getByText("Pedido entregado")).toBeOnTheScreen();
    expect(screen.getByText("¡Gracias por tu compra!")).toBeOnTheScreen();
    expect(screen.getByText("#187")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: /Paso 4 de 4: Entregado$/ })).toBeOnTheScreen();

    const hide = screen.getByRole("button", { name: "Ocultar" });
    expect(hide).toHaveStyle({ width: 48, height: 48 });
    await fireEvent.press(hide);
    expect(props.onHide).toHaveBeenCalledWith(delivered);
    expect(props.onOpen).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole("button", { name: /^Pedido entregado/ }));
    expect(props.onOpen).toHaveBeenCalledWith(delivered);
  });

  test("RF-10, RF-24: a rejected order, with its reason and without a timeline", async () => {
    const rejected = {
      ...ORDER,
      status: "rejected" as const,
      status_reason: "Fuera de zona",
      rejected_at: "2026-11-13T12:05:00Z",
    };
    await render(<ClientOrderCard card={{ kind: "finished", order: rejected }} now={NOW} {...handlers()} />);
    expect(screen.getByText("Pedido rechazado")).toBeOnTheScreen();
    expect(screen.getByText("Motivo: Fuera de zona")).toBeOnTheScreen();
    expect(screen.queryByLabelText(/^Paso/)).toBeNull();
    expect(screen.getByRole("button", { name: "Pedido rechazado, Motivo: Fuera de zona, #187" })).toBeOnTheScreen();
  });

  // Spec 010, RF-3 (replaces RF-12 of the 006): the Home is the Shop, so no card and no way to it.
  test("spec 010, RF-3: no order to show, no card at all", async () => {
    await render(<ClientOrderCard card={{ kind: "empty" }} now={NOW} {...handlers()} />);
    expect(screen.queryByText("No tenés pedidos en curso")).toBeNull();
    expect(screen.queryByRole("button", { name: "Ir a la Tienda" })).toBeNull();
    expect(screen.queryByTestId("client-order-card")).toBeNull();
  });
});

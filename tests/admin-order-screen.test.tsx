import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";

import AdminOrderScreen from "@/app/admin/order/[id]";
import { formatStepTime } from "@/logic/client-orders";
import { addDays, formatDayKey, toBuenosAiresDate } from "@/logic/dates";

// Spec 005 · T7 and T8: the order detail of the admin (RF-7 to RF-17, RF-19, RF-26), and spec 006 ·
// T5: "Lo canceló el cliente" (RF-31). The hooks, the router and Linking are replaced.
const tomorrow = addDays(toBuenosAiresDate(new Date()), 1);
const ORDER = {
  id: 187,
  status: "pending",
  status_reason: null as string | null,
  created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  delivery_date: tomorrow,
  slot_starts_at: "09:00:00",
  slot_ends_at: "11:00:00",
  client_first_name: "Rocío",
  client_last_name: "Fernández",
  client_phone: "1133445566",
  address: "Av. Rivadavia 4521",
  address_notes: "Timbre B",
  units: 9,
  total: 9600,
  items: [
    { name: "Maple Grandes", quantity: 3, unit_price: 1800 },
    { name: "Cajitas media docena", quantity: 6, unit_price: 700 },
  ],
};

type DetailQuery = { data: unknown; isPending: boolean; isError: boolean; refetch: jest.Mock };
const mockDetail: { current: DetailQuery } = { current: { data: ORDER, isPending: false, isError: false, refetch: jest.fn() } };
const mockSet = { mutateAsync: jest.fn(), isPending: false };
const mockBack = jest.fn();
const mockOpenURL = jest.fn();

jest.mock("@/lib/admin-orders", () => ({
  useAdminOrder: () => mockDetail.current,
  useSetOrderStatus: () => mockSet,
}));
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "187" }),
  router: { back: () => mockBack() },
}));
jest.mock("expo-linking", () => ({ openURL: (url: string) => mockOpenURL(url) }));

const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});

beforeEach(() => {
  mockDetail.current = { data: ORDER, isPending: false, isError: false, refetch: jest.fn() };
  mockSet.mutateAsync = jest.fn().mockResolvedValue("accepted");
  mockSet.isPending = false;
  mockBack.mockClear();
  mockOpenURL.mockReset().mockResolvedValue(true);
  alert.mockClear();
});

const withStatus = (status: string, fields: Record<string, unknown> = {}) => {
  mockDetail.current = { ...mockDetail.current, data: { ...ORDER, status, ...fields } };
};
const button = (name: string) => screen.getByRole("button", { name });
const pg = (code: string, message: string, hint: string | null = null) => ({ code, message, hint, details: null });

describe("Admin order detail", () => {
  test("RF-7: number, status, how long ago, client, address, day and slot, lines, payment and total", async () => {
    await render(<AdminOrderScreen />);
    expect(screen.getByRole("header", { name: "Pedido #187" })).toBeOnTheScreen();
    expect(screen.getByText("Nuevo · Hace 5 min")).toBeOnTheScreen();
    expect(screen.getByText("Rocío Fernández")).toBeOnTheScreen();
    expect(screen.getByText("1133445566")).toBeOnTheScreen();
    expect(screen.getByText("Av. Rivadavia 4521")).toBeOnTheScreen();
    expect(screen.getByText("Timbre B")).toBeOnTheScreen();
    expect(screen.getByText(`${formatDayKey(tomorrow, new Date())} · 9 a 11 h`)).toBeOnTheScreen();
    expect(screen.getByText("1 · Maple Grandes ×3")).toBeOnTheScreen();
    expect(screen.getByText("$5.400")).toBeOnTheScreen();
    expect(screen.getByText("2 · Cajitas media docena ×6")).toBeOnTheScreen();
    expect(screen.getByText("$4.200")).toBeOnTheScreen();
    expect(screen.getByText("Paga al recibir")).toBeOnTheScreen();
    expect(screen.getByLabelText("Total $9.600")).toBeOnTheScreen();
  });

  test.each([
    ["pending", ["Rechazar", "Aceptar pedido"]],
    ["accepted", ["Cancelar", "En camino"]],
    ["on_the_way", ["Cancelar", "Entregado"]],
  ])("RF-8: %s shows only its actions", async (status, actions) => {
    withStatus(status);
    await render(<AdminOrderScreen />);
    for (const action of actions) expect(button(action)).toBeEnabled();
    for (const other of ["Rechazar", "Aceptar pedido", "Cancelar", "En camino", "Entregado"].filter((a) => !actions.includes(a))) {
      expect(screen.queryByRole("button", { name: other })).toBeNull();
    }
  });

  test("RF-8: a finished order has no actions and shows its reason", async () => {
    withStatus("cancelled", { status_reason: "No estaba nadie" });
    await render(<AdminOrderScreen />);
    expect(screen.getByText(/^Cancelado · /)).toBeOnTheScreen();
    expect(screen.getByText("Motivo: No estaba nadie")).toBeOnTheScreen();
    for (const action of ["Rechazar", "Aceptar pedido", "Cancelar", "En camino", "Entregado"]) {
      expect(screen.queryByRole("button", { name: action })).toBeNull();
    }
  });

  test("RF-31 (spec 006): an order the client cancelled says so instead of a reason", async () => {
    withStatus("cancelled", { cancelled_by: "client", status_reason: null });
    await render(<AdminOrderScreen />);
    expect(screen.getByText(/^Cancelado · /)).toBeOnTheScreen();
    expect(screen.getByText("Lo canceló el cliente")).toBeOnTheScreen();
    expect(screen.queryByText(/^Motivo:/)).toBeNull();
  });

  test("RF-9: Llamar opens the phone with the number of the client", async () => {
    await render(<AdminOrderScreen />);
    await fireEvent.press(button("Llamar a Rocío Fernández"));
    expect(mockOpenURL).toHaveBeenCalledWith("tel:+5491133445566");
  });

  test("RF-10: WhatsApp opens a chat with the number of the client", async () => {
    await render(<AdminOrderScreen />);
    await fireEvent.press(button("WhatsApp a Rocío Fernández"));
    expect(mockOpenURL).toHaveBeenCalledWith("https://wa.me/5491133445566");
  });

  test("RF-10: if WhatsApp cannot be opened, it says so", async () => {
    mockOpenURL.mockRejectedValue(new Error("no app"));
    await render(<AdminOrderScreen />);
    await fireEvent.press(button("WhatsApp a Rocío Fernández"));
    await waitFor(() => expect(alert).toHaveBeenCalledWith("No pudimos abrir WhatsApp"));
  });

  test.each([
    ["pending", "Aceptar pedido", "accepted", "RF-11"],
    ["accepted", "En camino", "on_the_way", "RF-13"],
    ["on_the_way", "Entregado", "delivered", "RF-14"],
  ])("%s → %s calls the base and closes (%s… %s)", async (status, action, target) => {
    withStatus(status);
    await render(<AdminOrderScreen />);
    await fireEvent.press(button(action));
    expect(mockSet.mutateAsync).toHaveBeenCalledWith({ orderId: 187, status: target, reason: null });
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });

  test("RF-17: if the order changed meanwhile, it says so, reloads it and stays open", async () => {
    mockSet.mutateAsync.mockRejectedValue(pg("P0001", "order_changed", "cancelled"));
    await render(<AdminOrderScreen />);
    await fireEvent.press(button("Aceptar pedido"));
    expect(await screen.findByText("Este pedido cambió: ahora está cancelado")).toBeOnTheScreen();
    expect(mockDetail.current.refetch).toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
  });

  test("RF-26: delivering without enough stock says how many eggs are missing", async () => {
    withStatus("on_the_way");
    mockSet.mutateAsync.mockRejectedValue(pg("P0001", "not_enough_stock", "30|Medianos"));
    await render(<AdminOrderScreen />);
    await fireEvent.press(button("Entregado"));
    expect(await screen.findByText("No hay stock para entregar este pedido: faltan 30 huevos de Medianos")).toBeOnTheScreen();
    expect(mockBack).not.toHaveBeenCalled();
  });

  test("while a change is being sent, the button shows it and takes no other tap", async () => {
    mockSet.isPending = true;
    await render(<AdminOrderScreen />);
    expect(button("Aceptar pedido")).toBeBusy();
    expect(button("Aceptar pedido")).toBeDisabled();
  });

  test("an order that does not exist says so", async () => {
    mockDetail.current = { ...mockDetail.current, data: null };
    await render(<AdminOrderScreen />);
    expect(screen.getByText("Este pedido ya no existe")).toBeOnTheScreen();
  });

  test("while loading, and when it fails, with retry", async () => {
    mockDetail.current = { ...mockDetail.current, data: undefined, isPending: true };
    const view = await render(<AdminOrderScreen />);
    expect(screen.getByLabelText("Cargando")).toBeOnTheScreen();

    mockDetail.current = { ...mockDetail.current, isPending: false, isError: true };
    await view.rerender(<AdminOrderScreen />);
    await fireEvent.press(button("Reintentar"));
    expect(mockDetail.current.refetch).toHaveBeenCalled();
  });

});

describe("Rejecting and cancelling with a reason (T8)", () => {
  const reason = (label: string) => screen.getByLabelText(label);

  test("RF-19: Rechazar asks for confirmation first, with an optional reason", async () => {
    await render(<AdminOrderScreen />);
    await fireEvent.press(button("Rechazar"));
    expect(mockSet.mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByText("¿Rechazar el pedido #187?")).toBeOnTheScreen();
    expect(reason("Motivo (opcional)")).toBeOnTheScreen();
    expect(button("Confirmar rechazo")).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Aceptar pedido" })).toBeNull();
  });

  test("RF-12: rejecting without a reason sends none and closes", async () => {
    mockSet.mutateAsync.mockResolvedValue("rejected");
    await render(<AdminOrderScreen />);
    await fireEvent.press(button("Rechazar"));
    await fireEvent.press(button("Confirmar rechazo"));
    expect(mockSet.mutateAsync).toHaveBeenCalledWith({ orderId: 187, status: "rejected", reason: null });
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });

  test("RF-12: rejecting with a reason sends it trimmed", async () => {
    mockSet.mutateAsync.mockResolvedValue("rejected");
    await render(<AdminOrderScreen />);
    await fireEvent.press(button("Rechazar"));
    await fireEvent.changeText(reason("Motivo (opcional)"), "  Fuera de zona  ");
    await fireEvent.press(button("Confirmar rechazo"));
    expect(mockSet.mutateAsync).toHaveBeenCalledWith({ orderId: 187, status: "rejected", reason: "Fuera de zona" });
  });

  test("RF-15, RF-16, RF-19: cancelling asks for a reason and does not send without one", async () => {
    withStatus("accepted");
    await render(<AdminOrderScreen />);
    await fireEvent.press(button("Cancelar"));
    expect(screen.getByText("¿Cancelar el pedido #187?")).toBeOnTheScreen();
    await fireEvent.press(button("Confirmar cancelación"));
    expect(screen.getByText("Escribí el motivo")).toBeOnTheScreen();
    expect(mockSet.mutateAsync).not.toHaveBeenCalled();
  });

  test("RF-15: cancelling an order on the way with a reason", async () => {
    withStatus("on_the_way");
    mockSet.mutateAsync.mockResolvedValue("cancelled");
    await render(<AdminOrderScreen />);
    await fireEvent.press(button("Cancelar"));
    await fireEvent.changeText(reason("Motivo"), "No estaba nadie");
    await fireEvent.press(button("Confirmar cancelación"));
    expect(mockSet.mutateAsync).toHaveBeenCalledWith({ orderId: 187, status: "cancelled", reason: "No estaba nadie" });
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });

  test("RF-16: a reason of 121 characters is not sent", async () => {
    await render(<AdminOrderScreen />);
    await fireEvent.press(button("Rechazar"));
    await fireEvent.changeText(reason("Motivo (opcional)"), "m".repeat(121));
    await fireEvent.press(button("Confirmar rechazo"));
    expect(screen.getByText("Usá hasta 120 caracteres")).toBeOnTheScreen();
    expect(mockSet.mutateAsync).not.toHaveBeenCalled();
  });

  test("RF-19: \"No, volver\" leaves the order as it was and brings the actions back", async () => {
    await render(<AdminOrderScreen />);
    await fireEvent.press(button("Rechazar"));
    await fireEvent.press(button("No, volver"));
    expect(mockSet.mutateAsync).not.toHaveBeenCalled();
    expect(button("Aceptar pedido")).toBeEnabled();
    expect(screen.queryByText("¿Rechazar el pedido #187?")).toBeNull();
  });

  test("RF-17: if the client cancelled it meanwhile, it says so and leaves the confirmation", async () => {
    mockSet.mutateAsync.mockRejectedValue(pg("P0001", "order_changed", "cancelled"));
    await render(<AdminOrderScreen />);
    await fireEvent.press(button("Rechazar"));
    await fireEvent.press(button("Confirmar rechazo"));
    expect(await screen.findByText("Este pedido cambió: ahora está cancelado")).toBeOnTheScreen();
    expect(screen.queryByText("¿Rechazar el pedido #187?")).toBeNull();
    expect(mockDetail.current.refetch).toHaveBeenCalled();
  });
});

// Spec 008 · T7: the detail of a counter sale (RF-17).
describe("Admin order detail · counter sale (spec 008)", () => {
  const SALE = {
    ...ORDER,
    id: 212,
    status: "delivered",
    counter_sale: true,
    customer_name: "Juan Gómez" as string | null,
    delivered_at: "2026-11-17T17:32:00Z",
    client_first_name: null,
    client_last_name: null,
    client_phone: null,
    address: null,
    address_notes: null,
    delivery_date: null,
    slot_starts_at: null,
    slot_ends_at: null,
  };

  test("RF-17: Venta en el local, the name, when, the lines, Pagó en efectivo and the total", async () => {
    mockDetail.current = { ...mockDetail.current, data: SALE };
    await render(<AdminOrderScreen />);
    expect(screen.getByText("Venta en el local")).toBeOnTheScreen();
    expect(screen.getByText("Juan Gómez")).toBeOnTheScreen();
    expect(screen.getByText(`Entregado · ${formatStepTime("2026-11-17T17:32:00Z")}`)).toBeOnTheScreen();
    expect(screen.getByLabelText("1 · Maple Grandes ×3, $5.400")).toBeOnTheScreen();
    expect(screen.getByText("Pagó en efectivo")).toBeOnTheScreen();
    expect(screen.getByLabelText("Total $9.600")).toBeOnTheScreen();
  });

  test("RF-17: no address, slot, Llamar, WhatsApp nor actions", async () => {
    mockDetail.current = { ...mockDetail.current, data: SALE };
    await render(<AdminOrderScreen />);
    expect(screen.queryByTestId("order-address")).toBeNull();
    // Only the header's way back: no Llamar, WhatsApp nor status actions.
    expect(screen.getAllByRole("button").map((b) => b.props.accessibilityLabel)).toEqual(["Volver"]);
    expect(screen.queryByText("Paga al recibir")).toBeNull();
  });

  test("RF-17: without a name, only Venta en el local", async () => {
    mockDetail.current = { ...mockDetail.current, data: { ...SALE, customer_name: null } };
    await render(<AdminOrderScreen />);
    expect(screen.getByText("Venta en el local")).toBeOnTheScreen();
    expect(screen.queryByText("Cliente")).toBeNull();
  });
});

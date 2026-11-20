import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Alert, type AlertButton } from "react-native";

import ClientOrderScreen from "@/app/client/order/[id]";

// Spec 006 · T9: the order detail of the client and its cancellation (RF-4 to RF-9, RF-21 to RF-25).
// The hooks and the router are replaced; Alert is recorded so its buttons can be pressed.
const ORDER = {
  id: 187,
  status: "pending",
  status_reason: null as string | null,
  cancelled_by: null as string | null,
  delivery_date: "2026-11-16",
  slot_starts_at: "09:00:00",
  slot_ends_at: "11:00:00",
  total: 15000,
  address: "Av. Rivadavia 4521",
  address_notes: "Timbre B",
  created_at: "2026-11-13T13:32:00Z",
  accepted_at: null as string | null,
  on_the_way_at: null as string | null,
  delivered_at: null as string | null,
  rejected_at: null as string | null,
  cancelled_at: null as string | null,
  units: 3,
  items: [
    { product_id: 1, name: "Maple Grandes", egg_type_name: "Grandes", format_name: "Maple", quantity: 2, unit_price: 5000 },
    { product_id: 2, name: "Maple Medianos", egg_type_name: "Medianos", format_name: "Maple", quantity: 1, unit_price: 5000 },
  ],
};

type DetailQuery = { data: unknown; isPending: boolean; isError: boolean; refetch: jest.Mock };
const mockDetail: { current: DetailQuery } = { current: { data: ORDER, isPending: false, isError: false, refetch: jest.fn() } };
const mockCancel = { mutateAsync: jest.fn(), isPending: false };

jest.mock("@/lib/client-orders", () => ({
  useClientOrder: () => mockDetail.current,
  useCancelOrder: () => mockCancel,
}));
jest.mock("expo-router", () => ({ useLocalSearchParams: () => ({ id: "187" }), router: { back: jest.fn() } }));

const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});

beforeEach(() => {
  mockDetail.current = { data: ORDER, isPending: false, isError: false, refetch: jest.fn() };
  mockCancel.mutateAsync = jest.fn().mockResolvedValue("cancelled");
  mockCancel.isPending = false;
  alert.mockClear();
});

const withOrder = (fields: Record<string, unknown>) => {
  mockDetail.current = { ...mockDetail.current, data: { ...ORDER, ...fields } };
};
const pg = (code: string, message: string, hint: string | null = null) => ({ code, message, hint, details: null });
/** The buttons of the last confirmation that was shown. */
const confirmation = () => {
  const [title, , buttons] = alert.mock.calls[alert.mock.calls.length - 1];
  return { title, buttons: (buttons ?? []) as AlertButton[] };
};
const pressInAlert = async (text: string) => {
  const button = confirmation().buttons.find((candidate) => candidate.text === text);
  await act(async () => button?.onPress?.());
};

describe("Client order detail", () => {
  test("RF-22: number, status, address, day and slot, each line with its current name and saved price, payment and total", async () => {
    await render(<ClientOrderScreen />);
    expect(screen.getByRole("header", { name: "Pedido #187" })).toBeOnTheScreen();
    expect(screen.getByText("Pedido recibido")).toBeOnTheScreen();
    expect(screen.getByText("Av. Rivadavia 4521")).toBeOnTheScreen();
    expect(screen.getByText("Timbre B")).toBeOnTheScreen();
    expect(screen.getByText(/· 9 a 11 h$/)).toBeOnTheScreen();
    expect(screen.getByLabelText("1 · Maple Grandes ×2, $10.000")).toBeOnTheScreen();
    expect(screen.getByLabelText("2 · Maple Medianos ×1, $5.000")).toBeOnTheScreen();
    expect(screen.getByText("Paga al recibir")).toBeOnTheScreen();
    expect(screen.getByLabelText("Total $15.000")).toBeOnTheScreen();
  });

  test("RF-23: the timeline with the date and time of each step reached", async () => {
    withOrder({ status: "accepted", accepted_at: "2026-11-13T13:40:00Z" });
    await render(<ClientOrderScreen />);
    expect(screen.getByLabelText("Recibido, vie 13 nov 10:32")).toBeOnTheScreen();
    expect(screen.getByLabelText("Aceptado, vie 13 nov 10:40")).toBeOnTheScreen();
    expect(screen.getByLabelText("En camino, pendiente")).toBeOnTheScreen();
  });

  test("RF-23, RF-24: a rejected order with its reason, its timeline ending in Rechazado", async () => {
    withOrder({ status: "rejected", status_reason: "Fuera de zona", rejected_at: "2026-11-13T13:50:00Z" });
    await render(<ClientOrderScreen />);
    expect(screen.getByText("Pedido rechazado")).toBeOnTheScreen();
    expect(screen.getByText("Motivo: Fuera de zona")).toBeOnTheScreen();
    expect(screen.getByLabelText("Rechazado, vie 13 nov 10:50")).toBeOnTheScreen();
    expect(screen.queryByText("Entregado")).toBeNull();
  });

  test("RF-25: an order the client cancelled says so", async () => {
    withOrder({ status: "cancelled", cancelled_by: "client", cancelled_at: "2026-11-13T13:45:00Z" });
    await render(<ClientOrderScreen />);
    expect(screen.getByText("Cancelaste este pedido")).toBeOnTheScreen();
    expect(screen.queryByText(/^Motivo:/)).toBeNull();
  });

  test.each(["accepted", "on_the_way", "delivered", "rejected", "cancelled"])(
    "RF-5: a %s order cannot be cancelled from the app",
    async (status) => {
      withOrder({ status, cancelled_by: status === "cancelled" ? "admin" : null });
      await render(<ClientOrderScreen />);
      expect(screen.queryByRole("button", { name: "Cancelar pedido" })).toBeNull();
    },
  );

  test("RF-6: Cancelar pedido asks first, with Sí, cancelar and No, volver", async () => {
    await render(<ClientOrderScreen />);
    await fireEvent.press(screen.getByRole("button", { name: "Cancelar pedido" }));
    const { title, buttons } = confirmation();
    expect(title).toBe("¿Cancelar el pedido #187?");
    expect(buttons.map((button) => [button.text, button.style])).toEqual([
      ["No, volver", "cancel"],
      ["Sí, cancelar", "destructive"],
    ]);
    expect(mockCancel.mutateAsync).not.toHaveBeenCalled();
  });

  test("RF-6: No, volver leaves the order as it was", async () => {
    await render(<ClientOrderScreen />);
    await fireEvent.press(screen.getByRole("button", { name: "Cancelar pedido" }));
    await pressInAlert("No, volver");
    expect(mockCancel.mutateAsync).not.toHaveBeenCalled();
  });

  test("RF-7: Sí, cancelar cancels the order once, even when pressed twice", async () => {
    let finish: (value: string) => void = () => {};
    mockCancel.mutateAsync = jest.fn(() => new Promise<string>((resolve) => (finish = resolve)));
    await render(<ClientOrderScreen />);
    await fireEvent.press(screen.getByRole("button", { name: "Cancelar pedido" }));
    await pressInAlert("Sí, cancelar");
    await pressInAlert("Sí, cancelar");
    await act(async () => finish("cancelled"));
    expect(mockCancel.mutateAsync).toHaveBeenCalledTimes(1);
    expect(mockCancel.mutateAsync).toHaveBeenCalledWith(187);
  });

  test("RF-8: if the admin accepted it meanwhile, it says so and reloads the order", async () => {
    mockCancel.mutateAsync = jest.fn().mockRejectedValue(pg("P0001", "order_changed", "accepted"));
    await render(<ClientOrderScreen />);
    await fireEvent.press(screen.getByRole("button", { name: "Cancelar pedido" }));
    await pressInAlert("Sí, cancelar");
    expect(screen.getByText("Este pedido cambió: ahora está aceptado")).toBeOnTheScreen();
    expect(mockDetail.current.refetch).toHaveBeenCalled();
  });

  test("without connection, it says so and the order stays as it was", async () => {
    mockCancel.mutateAsync = jest.fn().mockRejectedValue(pg("", "TypeError: Network request failed"));
    await render(<ClientOrderScreen />);
    await fireEvent.press(screen.getByRole("button", { name: "Cancelar pedido" }));
    await pressInAlert("Sí, cancelar");
    expect(screen.getByText("No hay conexión. Revisá tu internet e intentá de nuevo")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Cancelar pedido" })).toBeEnabled();
  });

  test("while the cancellation is being sent, the button shows it and takes no other tap", async () => {
    mockCancel.isPending = true;
    await render(<ClientOrderScreen />);
    expect(screen.getByRole("button", { name: "Cancelar pedido" })).toBeDisabled();
  });

  test("an order that is not among the client's says so", async () => {
    mockDetail.current = { ...mockDetail.current, data: null };
    await render(<ClientOrderScreen />);
    expect(screen.getByText("No encontramos este pedido")).toBeOnTheScreen();
  });

  test("while loading, and when it fails, with retry", async () => {
    mockDetail.current = { data: undefined, isPending: true, isError: false, refetch: jest.fn() };
    const view = await render(<ClientOrderScreen />);
    expect(screen.getByLabelText("Cargando")).toBeOnTheScreen();

    mockDetail.current = { data: undefined, isPending: false, isError: true, refetch: jest.fn() };
    await view.rerender(<ClientOrderScreen />);
    expect(screen.getByText("No pudimos cargar el pedido")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Reintentar" }));
    expect(mockDetail.current.refetch).toHaveBeenCalled();
  });
});

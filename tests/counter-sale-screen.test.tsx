import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Alert, type AlertButton } from "react-native";

import CounterSale from "@/app/admin/counter-sale";

// Spec 008 · T5: the counter sale (RF-2 to RF-7, RF-9 to RF-13). The hooks and the router are replaced;
// Alert is recorded so its buttons can be pressed. The limits come from the real cart functions.
const product = (fields: { id: number; name: string } & Record<string, unknown>) => ({
  format_id: 1,
  format_name: "Maple",
  price: 5000,
  units_available: 10,
  available: true,
  ...fields,
});
const PRODUCTS = [
  product({ id: 1, name: "Maple Grandes" }),
  product({ id: 2, name: "Maple Super", units_available: 2 }),
  product({ id: 3, name: "Maple Medianos", units_available: 0, available: false }),
  product({ id: 4, name: "Pack Grandes", format_id: 2, format_name: "Pack", price: 28000, units_available: 120 }),
];

type Query = { data: unknown[] | undefined; isPending: boolean; isError: boolean; refetch: jest.Mock };
const mockProducts: { current: Query } = {
  current: { data: PRODUCTS, isPending: false, isError: false, refetch: jest.fn() },
};
const mockCreate = { mutateAsync: jest.fn(), isPending: false };
const mockBack = jest.fn();
// usePreventRemove of expo-router (spec 008, RF-8): what the screen asked and what it does when blocked.
type Blocked = { data: { action: unknown }; repeat: () => void };
const mockPrevent: { active: boolean; callback?: (blocked: Blocked) => void } = { active: false };
const mockDisable = jest.fn();

jest.mock("@/lib/catalog", () => ({ useShopProducts: () => mockProducts.current }));
jest.mock("@/lib/admin-orders", () => ({ useCreateCounterSale: () => mockCreate }));
jest.mock("expo-router", () => ({
  router: { back: (...args: unknown[]) => mockBack(...args), push: jest.fn() },
  usePreventRemove: (active: boolean, callback: (blocked: Blocked) => void) => {
    mockPrevent.active = active;
    mockPrevent.callback = callback;
    return mockDisable;
  },
}));

const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});

beforeEach(() => {
  mockProducts.current = { data: PRODUCTS, isPending: false, isError: false, refetch: jest.fn() };
  mockCreate.mutateAsync = jest.fn().mockResolvedValue({ order_id: 212, total: 10000 });
  mockCreate.isPending = false;
  mockBack.mockClear();
  mockDisable.mockClear();
  mockPrevent.active = false;
  alert.mockClear();
});

const lastAlert = () => {
  const [title, , buttons] = alert.mock.calls[alert.mock.calls.length - 1];
  return { title, buttons: (buttons ?? []) as AlertButton[] };
};
const pressInAlert = async (text: string) => {
  const button = lastAlert().buttons.find((candidate) => candidate.text === text);
  await act(async () => button?.onPress?.());
};
const add = (name: string) => fireEvent.press(screen.getByRole("button", { name: `Agregar una unidad de ${name}` }));
const confirmBar = () => screen.getByRole("button", { name: /^Confirmar venta,/ });

describe("Counter sale", () => {
  test("RF-2: every product of the Shop with its price and units left, by format, with the filters", async () => {
    await render(<CounterSale />);
    expect(screen.getByRole("header", { name: "Nueva venta" })).toBeOnTheScreen();
    expect(screen.getByText("Maple Grandes")).toBeOnTheScreen();
    expect(screen.getByText("Quedan 10")).toBeOnTheScreen();
    expect(screen.getAllByText("$5.000")).toHaveLength(3);
    expect(screen.getByText("Sin stock")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Pack" }));
    expect(screen.queryByText("Maple Grandes")).toBeNull();
    expect(screen.getByText("Pack Grandes")).toBeOnTheScreen();
  });

  test("RF-3, RF-7: + adds a unit, then − and the quantity show; the total and the units follow", async () => {
    await render(<CounterSale />);
    expect(screen.queryByRole("button", { name: "Quitar una unidad de Maple Grandes" })).toBeNull();
    await add("Maple Grandes");
    await add("Maple Grandes");
    expect(screen.getByLabelText("2 unidades de Maple Grandes")).toBeOnTheScreen();
    expect(confirmBar()).toHaveProp("accessibilityLabel", "Confirmar venta, 2 productos, $10.000");
    await fireEvent.press(screen.getByRole("button", { name: "Quitar una unidad de Maple Grandes" }));
    await fireEvent.press(screen.getByRole("button", { name: "Quitar una unidad de Maple Grandes" }));
    expect(screen.queryByRole("button", { name: "Quitar una unidad de Maple Grandes" })).toBeNull();
    expect(confirmBar()).toBeDisabled();
  });

  test("RF-3: past the 5 of the Shop", async () => {
    await render(<CounterSale />);
    await fireEvent.press(screen.getByRole("button", { name: "Pack" }));
    for (let i = 0; i < 6; i++) await add("Pack Grandes");
    expect(screen.getByLabelText("6 unidades de Pack Grandes")).toBeOnTheScreen();
    expect(alert).not.toHaveBeenCalled();
  });

  test("RF-4: no more than what is left", async () => {
    await render(<CounterSale />);
    await add("Maple Super");
    await add("Maple Super");
    await add("Maple Super");
    expect(lastAlert().title).toBe("No quedan más unidades");
    expect(screen.getByLabelText("2 unidades de Maple Super")).toBeOnTheScreen();
  });

  test("RF-4: no more than 99", async () => {
    await render(<CounterSale />);
    await fireEvent.press(screen.getByRole("button", { name: "Pack" }));
    for (let i = 0; i < 100; i++) await add("Pack Grandes");
    expect(lastAlert().title).toBe("Máximo 99 por producto");
    expect(screen.getByLabelText("99 unidades de Pack Grandes")).toBeOnTheScreen();
  });

  test("RF-5: a product without units says so and its + is disabled", async () => {
    await render(<CounterSale />);
    expect(screen.getByRole("button", { name: "No disponible: sin stock" })).toBeDisabled();
  });

  test("RF-6: an optional name of up to 60 characters", async () => {
    await render(<CounterSale />);
    const name = screen.getByLabelText("Nombre del cliente (opcional)");
    expect(name).toHaveProp("maxLength", 60);
  });

  test("RF-7: without products, Confirmar venta is disabled", async () => {
    await render(<CounterSale />);
    expect(confirmBar()).toBeDisabled();
    expect(confirmBar()).toHaveProp("accessibilityLabel", "Confirmar venta, 0 productos, $0");
  });

  test("RF-9: confirming asks first with the total; No, volver sends nothing", async () => {
    await render(<CounterSale />);
    await add("Maple Grandes");
    await fireEvent.press(confirmBar());
    expect(lastAlert().title).toBe("¿Registrar la venta por $5.000?");
    expect(lastAlert().buttons.map((button) => button.text)).toEqual(["No, volver", "Sí, registrar"]);
    await pressInAlert("No, volver");
    expect(mockCreate.mutateAsync).not.toHaveBeenCalled();
  });

  test("RF-10, RF-12, RF-13: Sí, registrar sends the sale once, closes and says it was registered", async () => {
    let finish: (value: unknown) => void = () => {};
    mockCreate.mutateAsync = jest.fn(() => new Promise((resolve) => (finish = resolve)));
    await render(<CounterSale />);
    await add("Maple Grandes");
    await add("Maple Grandes");
    await fireEvent.changeText(screen.getByLabelText("Nombre del cliente (opcional)"), "Juan");
    await fireEvent.press(confirmBar());
    const yes = lastAlert().buttons.find((button) => button.text === "Sí, registrar");
    await act(async () => {
      yes?.onPress?.();
      yes?.onPress?.();
    });
    await act(async () => finish({ order_id: 212, total: 10000 }));
    expect(mockCreate.mutateAsync).toHaveBeenCalledTimes(1);
    expect(mockCreate.mutateAsync).toHaveBeenCalledWith({
      items: [{ product_id: 1, quantity: 2 }],
      expectedTotal: 10000,
      customerName: "Juan",
    });
    expect(mockBack).toHaveBeenCalled();
    expect(lastAlert().title).toBe("Venta registrada · #212 · $10.000");
  });

  test("RF-12: while it is sent, the bar shows it and takes no other tap", async () => {
    mockCreate.isPending = true;
    await render(<CounterSale />);
    await add("Maple Grandes");
    expect(screen.getByLabelText("Enviando")).toBeOnTheScreen();
    expect(confirmBar()).toBeDisabled();
  });

  test.each([
    [{ code: "P0001", message: "not_enough_units", details: null, hint: "Maple Grandes" }, "No alcanzan las unidades de Maple Grandes"],
    [{ code: "P0001", message: "price_changed", details: null, hint: null }, "Cambiaron los precios, revisá la venta"],
    [{ code: "", message: "Network request failed", details: null, hint: null }, "No pudimos registrar la venta. Revisá tu conexión."],
  ])("RF-11: a refused sale says why and keeps what was loaded (%o)", async (error, text) => {
    mockCreate.mutateAsync = jest.fn().mockRejectedValue(error);
    await render(<CounterSale />);
    await add("Maple Grandes");
    await fireEvent.changeText(screen.getByLabelText("Nombre del cliente (opcional)"), "Juan");
    await fireEvent.press(confirmBar());
    await pressInAlert("Sí, registrar");
    expect(lastAlert().title).toBe(text);
    expect(mockBack).not.toHaveBeenCalled();
    expect(screen.getByLabelText("1 unidad de Maple Grandes")).toBeOnTheScreen();
    expect(screen.getByLabelText("Nombre del cliente (opcional)")).toHaveProp("value", "Juan");
  });

  test("while loading, when it fails with retry, and without products", async () => {
    mockProducts.current = { ...mockProducts.current, data: undefined, isPending: true };
    const view = await render(<CounterSale />);
    expect(screen.getByLabelText("Cargando")).toBeOnTheScreen();

    mockProducts.current = { ...mockProducts.current, isPending: false, isError: true };
    await view.rerender(<CounterSale />);
    await fireEvent.press(screen.getByRole("button", { name: "Reintentar" }));
    expect(mockProducts.current.refetch).toHaveBeenCalled();

    mockProducts.current = { ...mockProducts.current, isError: false, data: [] };
    await view.rerender(<CounterSale />);
    expect(screen.getByText("No hay productos para vender")).toBeOnTheScreen();
  });

  test("only + and − change the quantity: the row itself is not a button", async () => {
    await render(<CounterSale />);
    expect(screen.queryByRole("button", { name: /^Maple Grandes,/ })).toBeNull();
  });

  // Spec 008 · T6: leaving with a sale built asks first (RF-8).
  test("RF-8: without products, leaving is not held", async () => {
    await render(<CounterSale />);
    expect(mockPrevent.active).toBe(false);
  });

  test("RF-8: with products, leaving asks; Seguir vendiendo stays and Descartar leaves", async () => {
    await render(<CounterSale />);
    await add("Maple Grandes");
    expect(mockPrevent.active).toBe(true);
    const repeat = jest.fn();
    await act(async () => mockPrevent.callback?.({ data: { action: { type: "GO_BACK" } }, repeat }));
    expect(lastAlert().title).toBe("¿Descartar la venta?");
    expect(lastAlert().buttons.map((button) => button.text)).toEqual(["Seguir vendiendo", "Descartar"]);
    await pressInAlert("Seguir vendiendo");
    expect(repeat).not.toHaveBeenCalled();
    expect(screen.getByLabelText("1 unidad de Maple Grandes")).toBeOnTheScreen();
    await pressInAlert("Descartar");
    expect(repeat).toHaveBeenCalled();
  });

  test("RF-8, RF-13: after registering, the screen closes without asking", async () => {
    await render(<CounterSale />);
    await add("Maple Grandes");
    await fireEvent.press(confirmBar());
    await pressInAlert("Sí, registrar");
    expect(mockDisable).toHaveBeenCalled();
    expect(mockDisable.mock.invocationCallOrder[0]).toBeLessThan(mockBack.mock.invocationCallOrder[0] ?? 0);
  });

  // T8 (harden): a product that leaves the Shop while the sale is built has no row to take it out with.
  test("RF-11: a product that left the Shop drops out of the sale, so the rest can still be registered", async () => {
    const view = await render(<CounterSale />);
    await add("Maple Grandes");
    await add("Maple Super");
    mockProducts.current = { ...mockProducts.current, data: PRODUCTS.filter((p) => p.id !== 1) };
    await view.rerender(<CounterSale />);
    expect(confirmBar()).toHaveProp("accessibilityLabel", "Confirmar venta, 1 producto, $5.000");
    await fireEvent.press(confirmBar());
    await pressInAlert("Sí, registrar");
    expect(mockCreate.mutateAsync).toHaveBeenCalledWith({
      items: [{ product_id: 2, quantity: 1 }],
      expectedTotal: 5000,
      customerName: "",
    });
  });

  test("RF-8: if every product of the sale left the Shop, there is nothing to discard", async () => {
    const view = await render(<CounterSale />);
    await add("Maple Grandes");
    mockProducts.current = { ...mockProducts.current, data: PRODUCTS.filter((p) => p.id !== 1) };
    await view.rerender(<CounterSale />);
    expect(mockPrevent.active).toBe(false);
    expect(confirmBar()).toBeDisabled();
  });

  test("T8 (emil-design-eng): the quantity uses figures of one width, so + does not move from 9 to 10", async () => {
    await render(<CounterSale />);
    await add("Maple Grandes");
    expect(screen.getByLabelText("1 unidad de Maple Grandes")).toHaveStyle({ fontVariant: ["tabular-nums"] });
  });
});

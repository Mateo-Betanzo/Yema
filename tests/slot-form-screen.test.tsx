import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import { Alert, type AlertButton } from "react-native";

import SlotForm from "@/app/admin/slot-form";

// Spec 009 · T4: the form of a delivery slot, to create and to edit (RF-4 to RF-10, RF-16). The hooks
// and the router are replaced; the problems come from the real slotProblem.
const slot = (fields: Record<string, unknown>) => ({
  weekday: 1,
  starts_at: "09:00:00",
  ends_at: "11:00:00",
  capacity: 5,
  active: true,
  active_orders: 0,
  ...fields,
});
const SLOTS = [
  slot({ id: 1 }),
  slot({ id: 2, starts_at: "18:00:00", ends_at: "21:00:00" }),
  slot({ id: 3, weekday: 0, starts_at: "09:30:00", ends_at: "12:00:00", capacity: 100, active: false }),
  slot({ id: 4, weekday: 2, capacity: 1 }),
  // T5: a slot with orders in progress, and an inactive one with orders.
  slot({ id: 5, weekday: 3, active_orders: 3 }),
  slot({ id: 6, weekday: 4, active: false, active_orders: 2 }),
];

type Query = { data: unknown[] | undefined; isPending: boolean; isError: boolean; refetch: jest.Mock };
const mockSlots: { current: Query } = { current: { data: SLOTS, isPending: false, isError: false, refetch: jest.fn() } };
const mockSave = { mutateAsync: jest.fn(), isPending: false };
const mockParams: { current: { id?: string } } = { current: {} };
const mockBack = jest.fn();

jest.mock("@/lib/schedule", () => ({
  useDeliverySlots: () => mockSlots.current,
  useSaveDeliverySlot: () => mockSave,
}));
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams.current,
  router: { back: () => mockBack() },
}));

const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
const lastAlert = () => {
  const [title, , buttons] = alert.mock.calls[alert.mock.calls.length - 1];
  return { title, buttons: (buttons ?? []) as AlertButton[] };
};
const pressInAlert = async (text: string) => {
  const button = lastAlert().buttons.find((candidate) => candidate.text === text);
  await act(async () => button?.onPress?.());
};

beforeEach(() => {
  alert.mockClear();
  mockSlots.current = { data: SLOTS, isPending: false, isError: false, refetch: jest.fn() };
  mockSave.mutateAsync = jest.fn().mockResolvedValue(null);
  mockSave.isPending = false;
  mockParams.current = {};
  mockBack.mockClear();
});

/** The chip of a row of chips ("Día", "Desde", "Hasta"). */
const chip = (row: string, label: string) => within(screen.getByLabelText(row)).getByRole("button", { name: label });
const choose = (row: string, label: string) => fireEvent.press(chip(row, label));
const save = () => fireEvent.press(screen.getByRole("button", { name: "Guardar" }));

describe("Slot form · new", () => {
  test("RF-4: a new slot starts on Monday from 9 to 11 with a capacity of 5, active", async () => {
    await render(<SlotForm />);
    expect(screen.getByRole("header", { name: "Nueva franja" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Lunes" })).toBeSelected();
    expect(screen.getByLabelText("Cupo 5")).toBeOnTheScreen();
    expect(screen.getByRole("tab", { name: "Activa" })).toBeSelected();
  });

  test("RF-4, RF-10: choosing day, hours and capacity, and saving it with its day, goes back", async () => {
    await render(<SlotForm />);
    await choose("Día", "Domingo");
    await choose("Desde", "10:00");
    await choose("Hasta", "12:30");
    await fireEvent.press(screen.getByRole("button", { name: "Subir el cupo" }));
    await save();
    expect(mockSave.mutateAsync).toHaveBeenCalledWith({
      weekday: 0,
      starts_at: "10:00",
      ends_at: "12:30",
      capacity: 6,
      active: true,
    });
    expect(mockBack).toHaveBeenCalled();
  });

  test("RF-6: the hours are every half hour from 6:00 to 23:00", async () => {
    await render(<SlotForm />);
    const from = within(screen.getByLabelText("Desde")).getAllByRole("button");
    expect(from).toHaveLength(35);
    expect(from[0].props.accessibilityLabel).toBe("6:00");
    expect(from[34].props.accessibilityLabel).toBe("23:00");
  });
});

describe("Slot form · edit", () => {
  test("RF-5: a slot opens with its values; its day is shown, not chosen", async () => {
    mockParams.current = { id: "2" };
    await render(<SlotForm />);
    expect(screen.getByRole("header", { name: "Lunes · 18 a 21 h" })).toBeOnTheScreen();
    expect(screen.getByText("Lunes")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Domingo" })).toBeNull();
    expect(chip("Desde", "18:00")).toBeSelected();
    // T6: the chosen hours are also in the titles, even before the row scrolls to them.
    expect(screen.getByRole("header", { name: "Desde · 18:00" })).toBeOnTheScreen();
    expect(screen.getByRole("header", { name: "Hasta · 21:00" })).toBeOnTheScreen();
    expect(chip("Hasta", "21:00")).toBeSelected();
  });

  test("RF-5, RF-10: saving sends its id and its new values", async () => {
    mockParams.current = { id: "2" };
    await render(<SlotForm />);
    await choose("Desde", "18:30");
    await fireEvent.press(screen.getByRole("button", { name: "Bajar el cupo" }));
    await save();
    expect(mockSave.mutateAsync).toHaveBeenCalledWith({
      id: 2,
      weekday: 1,
      starts_at: "18:30",
      ends_at: "21:00",
      capacity: 4,
      active: true,
    });
  });

  test("RF-6: the capacity goes from 1 to 100", async () => {
    mockParams.current = { id: "3" };
    const view = await render(<SlotForm />);
    expect(screen.getByRole("button", { name: "Subir el cupo" })).toBeDisabled();
    mockParams.current = { id: "4" };
    await view.rerender(<SlotForm key="4" />);
    expect(screen.getByRole("button", { name: "Bajar el cupo" })).toBeDisabled();
  });

  test("a slot that no longer exists says so", async () => {
    mockParams.current = { id: "99" };
    await render(<SlotForm />);
    expect(screen.getByText("Esta franja ya no existe")).toBeOnTheScreen();
  });
});

describe("Slot form · problems and errors", () => {
  test("RF-7: it has to end after it starts", async () => {
    await render(<SlotForm />);
    await choose("Día", "Domingo");
    await choose("Desde", "12:00");
    await choose("Hasta", "11:00");
    await save();
    expect(screen.getByText("El horario tiene que terminar después de empezar")).toBeOnTheScreen();
    expect(mockSave.mutateAsync).not.toHaveBeenCalled();
  });

  test("RF-8: an overlap with another active slot of the day names it", async () => {
    await render(<SlotForm />);
    await choose("Desde", "10:00");
    await choose("Hasta", "12:00");
    await save();
    expect(screen.getByText("Se superpone con 9 a 11 h")).toBeOnTheScreen();
    expect(mockSave.mutateAsync).not.toHaveBeenCalled();
  });

  test("RF-9: the start of an inactive slot of the day says to edit it", async () => {
    await render(<SlotForm />);
    await choose("Día", "Domingo");
    await choose("Desde", "9:30");
    await choose("Hasta", "11:00");
    await save();
    expect(screen.getByText("Ya hay una franja inactiva el domingo a las 9:30. Editala y activala.")).toBeOnTheScreen();
  });

  test("RF-10: one save per tap", async () => {
    let finish: (value: unknown) => void = () => {};
    mockSave.mutateAsync = jest.fn(() => new Promise((resolve) => (finish = resolve)));
    await render(<SlotForm />);
    await choose("Día", "Domingo");
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Guardar" }));
      fireEvent.press(screen.getByRole("button", { name: "Guardar" }));
    });
    await act(async () => finish(null));
    expect(mockSave.mutateAsync).toHaveBeenCalledTimes(1);
  });

  test.each([
    [{ code: "23P01", message: 'violates exclusion constraint "delivery_slots_no_overlap"', details: null, hint: null }, "Se superpone con otra franja activa del mismo día"],
    [{ code: "", message: "Network request failed", details: null, hint: null }, "No hay conexión. Revisá tu internet e intentá de nuevo"],
  ])("RF-16: a refused save says why and keeps what was chosen (%o)", async (error, text) => {
    mockSave.mutateAsync = jest.fn().mockRejectedValue(error);
    await render(<SlotForm />);
    await choose("Día", "Domingo");
    await save();
    expect(await screen.findByText(text)).toBeOnTheScreen();
    expect(mockBack).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Domingo" })).toBeSelected();
  });

  test("while loading, and when it fails, with retry", async () => {
    mockParams.current = { id: "2" };
    mockSlots.current = { ...mockSlots.current, data: undefined, isPending: true };
    const view = await render(<SlotForm />);
    expect(screen.getByLabelText("Cargando")).toBeOnTheScreen();
    mockSlots.current = { ...mockSlots.current, isPending: false, isError: true };
    await view.rerender(<SlotForm />);
    await fireEvent.press(screen.getByRole("button", { name: "Reintentar" }));
    expect(mockSlots.current.refetch).toHaveBeenCalled();
  });
});

// Spec 009 · T5: turning a slot off and on, and the warning of orders in progress (RF-11, RF-13 to RF-15).
describe("Slot form · active, inactive and orders in progress", () => {
  test("RF-11: a slot is turned off and saved", async () => {
    mockParams.current = { id: "2" };
    await render(<SlotForm />);
    await fireEvent.press(screen.getByRole("tab", { name: "Inactiva" }));
    await save();
    expect(mockSave.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ id: 2, active: false }));
    expect(alert).not.toHaveBeenCalled();
  });

  test("RF-11: an inactive slot is turned on and saved", async () => {
    mockParams.current = { id: "3" };
    await render(<SlotForm />);
    expect(screen.getByRole("tab", { name: "Inactiva" })).toBeSelected();
    await fireEvent.press(screen.getByRole("tab", { name: "Activa" }));
    await save();
    expect(mockSave.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ id: 3, active: true }));
  });

  test("RF-13: with orders in progress, a new capacity warns first; Volver keeps the form, Guardar saves", async () => {
    mockParams.current = { id: "5" };
    await render(<SlotForm />);
    await fireEvent.press(screen.getByRole("button", { name: "Bajar el cupo" }));
    await save();
    expect(lastAlert().title).toBe("Esta franja tiene 3 pedidos en curso: siguen como están");
    expect(lastAlert().buttons.map((button) => button.text)).toEqual(["Volver", "Guardar"]);
    await pressInAlert("Volver");
    expect(mockSave.mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Cupo 4")).toBeOnTheScreen();
    await save();
    await pressInAlert("Guardar");
    expect(mockSave.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ id: 5, capacity: 4 }));
    expect(mockBack).toHaveBeenCalled();
  });

  test("RF-13: with orders in progress, new hours or turning it off warn too", async () => {
    mockParams.current = { id: "5" };
    await render(<SlotForm />);
    await choose("Hasta", "12:00");
    await save();
    expect(alert).toHaveBeenCalledTimes(1);
    await pressInAlert("Volver");
    await choose("Hasta", "11:00");
    await fireEvent.press(screen.getByRole("tab", { name: "Inactiva" }));
    await save();
    expect(alert).toHaveBeenCalledTimes(2);
  });

  test("RF-13: no warning when nothing that matters changed, or when it is turned on", async () => {
    mockParams.current = { id: "5" };
    const view = await render(<SlotForm />);
    await save();
    expect(alert).not.toHaveBeenCalled();
    expect(mockSave.mutateAsync).toHaveBeenCalledTimes(1);
    mockParams.current = { id: "6" };
    await view.rerender(<SlotForm key="6" />);
    await fireEvent.press(screen.getByRole("tab", { name: "Activa" }));
    await save();
    expect(alert).not.toHaveBeenCalled();
    expect(mockSave.mutateAsync).toHaveBeenLastCalledWith(expect.objectContaining({ id: 6, active: true }));
  });

  test("RF-8, RF-13: a problem is said before any warning", async () => {
    mockParams.current = { id: "5" };
    await render(<SlotForm />);
    await choose("Desde", "12:00");
    await save();
    expect(screen.getByText("El horario tiene que terminar después de empezar")).toBeOnTheScreen();
    expect(alert).not.toHaveBeenCalled();
  });
});


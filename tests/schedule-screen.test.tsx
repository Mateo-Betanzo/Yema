import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import { Alert, type AlertButton } from "react-native";

import Schedule from "@/app/admin/schedule";

// Spec 009 · T3: the delivery schedule of the admin (RF-2 to RF-5). Cambio del 2026-11-19 · T9: each slot
// is one button that opens its "⋮" menu (RF-5, RF-18 to RF-22, RF-27). The hooks, the router and the
// system Alert are replaced; the days, the toggle and the messages are the real ones of logic/schedule.
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
  slot({ id: 2, starts_at: "18:00:00", ends_at: "21:00:00" }),
  slot({ id: 1 }),
  slot({ id: 3, weekday: 0, starts_at: "09:30:00", ends_at: "12:00:00", capacity: 3, active: false }),
];

type Query = { data: unknown[] | undefined; isPending: boolean; isError: boolean; refetch: jest.Mock };
const mockSlots: { current: Query } = { current: { data: SLOTS, isPending: false, isError: false, refetch: jest.fn() } };
const mockPush = jest.fn();

const mockSave = { mutateAsync: jest.fn() };
const mockArchive = { mutateAsync: jest.fn() };

jest.mock("@/lib/schedule", () => ({
  useDeliverySlots: () => mockSlots.current,
  useSaveDeliverySlot: () => mockSave,
  useArchiveDeliverySlot: () => mockArchive,
}));
jest.mock("expo-router", () => ({ router: { push: (href: unknown) => mockPush(href), back: jest.fn() } }));

const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});

beforeEach(() => {
  mockSlots.current = { data: SLOTS, isPending: false, isError: false, refetch: jest.fn() };
  mockPush.mockClear();
  mockSave.mutateAsync = jest.fn().mockResolvedValue(null);
  mockArchive.mutateAsync = jest.fn().mockResolvedValue(null);
  alert.mockClear();
});

const lastAlert = () => {
  const [title, message, buttons] = alert.mock.calls[alert.mock.calls.length - 1];
  return { title, message, buttons: (buttons ?? []) as AlertButton[] };
};
const pressInAlert = async (text: string) => {
  await act(async () => lastAlert().buttons.find((button) => button.text === text)?.onPress?.());
};
const openMenu = (name: string) => fireEvent.press(screen.getByRole("button", { name }));

describe("Delivery schedule", () => {
  test("RF-2: the seven days from Monday, as headers", async () => {
    await render(<Schedule />);
    expect(screen.getByRole("header", { name: "Agenda de reparto" })).toBeOnTheScreen();
    expect(screen.getAllByRole("header").map((header) => header.props.children).slice(1)).toEqual([
      "Lunes",
      "Martes",
      "Miércoles",
      "Jueves",
      "Viernes",
      "Sábado",
      "Domingo",
    ]);
  });

  test("RF-2, RF-27: each day with its slots from the earliest, each one button Opciones de <franja> with its capacity", async () => {
    await render(<Schedule />);
    const monday = screen.getByTestId("day-1");
    const rows = within(monday).getAllByRole("button");
    expect(rows.map((row) => row.props.accessibilityLabel)).toEqual([
      "Opciones de lunes 9 a 11 h",
      "Opciones de lunes 18 a 21 h",
    ]);
    expect(rows.map((row) => row.props.accessibilityValue)).toEqual([{ text: "Cupo 5" }, { text: "Cupo 5" }]);
    expect(within(monday).getByText("9 a 11 h")).toBeOnTheScreen();
    expect(within(monday).getAllByText("Cupo 5")).toHaveLength(2);
  });

  test("RF-3: an inactive slot says so in text, and a day without slots says Sin franjas", async () => {
    await render(<Schedule />);
    const sunday = screen.getByTestId("day-0");
    const row = within(sunday).getByRole("button", { name: "Opciones de domingo 9:30 a 12 h" });
    expect(row.props.accessibilityValue).toEqual({ text: "Cupo 3, inactiva" });
    expect(within(sunday).getByText("Inactiva")).toBeOnTheScreen();
    expect(within(screen.getByTestId("day-2")).getByText("Sin franjas")).toBeOnTheScreen();
  });

  test("RF-18, RF-27: each slot shows the ⋮ inside its card, which is at least 48 pt tall", async () => {
    await render(<Schedule />);
    const row = screen.getByRole("button", { name: "Opciones de lunes 9 a 11 h" });
    expect(within(row).getByTestId("icon:more-vert", { includeHiddenElements: true })).toBeOnTheScreen();
    expect(row).toHaveStyle({ minHeight: 64 });
  });

  test("RF-4: Nueva franja opens an empty form", async () => {
    await render(<Schedule />);
    await fireEvent.press(screen.getByRole("button", { name: "Nueva franja" }));
    expect(mockPush).toHaveBeenCalledWith("/admin/slot-form");
  });

  test("RF-18: touching a slot opens its menu: Editar, Desactivar, Eliminar and Cancelar", async () => {
    await render(<Schedule />);
    await openMenu("Opciones de lunes 18 a 21 h");
    expect(lastAlert().title).toBe("Lunes · 18 a 21 h");
    expect(lastAlert().buttons.map((button) => button.text)).toEqual(["Editar", "Desactivar", "Eliminar", "Cancelar"]);
  });

  test("RF-18: on Android, where Cancelar does not fit, the menu closes by tapping outside or going back", async () => {
    await render(<Schedule />);
    await openMenu("Opciones de lunes 18 a 21 h");
    expect(alert.mock.calls[0][3]).toEqual({ cancelable: true });
  });

  test("RF-18: an inactive slot offers Activar instead", async () => {
    await render(<Schedule />);
    await openMenu("Opciones de domingo 9:30 a 12 h");
    expect(lastAlert().buttons.map((button) => button.text)).toEqual(["Editar", "Activar", "Eliminar", "Cancelar"]);
  });

  test("RF-5: Editar opens the form of the slot", async () => {
    await render(<Schedule />);
    await openMenu("Opciones de lunes 18 a 21 h");
    await pressInAlert("Editar");
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/admin/slot-form", params: { id: "2" } });
  });

  test("RF-19: Desactivar without orders in progress saves the slot inactive, without the form", async () => {
    await render(<Schedule />);
    await openMenu("Opciones de lunes 9 a 11 h");
    await pressInAlert("Desactivar");
    expect(mockSave.mutateAsync).toHaveBeenCalledWith({
      id: 1,
      weekday: 1,
      starts_at: "09:00:00",
      ends_at: "11:00:00",
      capacity: 5,
      active: false,
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  test("RF-19, RF-13: Desactivar with orders in progress asks first; Volver saves nothing and Guardar saves", async () => {
    mockSlots.current = { ...mockSlots.current, data: [slot({ id: 1, active_orders: 2 })] };
    await render(<Schedule />);
    await openMenu("Opciones de lunes 9 a 11 h");
    await pressInAlert("Desactivar");
    expect(lastAlert().title).toBe("Esta franja tiene 2 pedidos en curso: siguen como están");
    expect(lastAlert().buttons.map((button) => button.text)).toEqual(["Volver", "Guardar"]);
    await pressInAlert("Volver");
    expect(mockSave.mutateAsync).not.toHaveBeenCalled();
    await pressInAlert("Guardar");
    expect(mockSave.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ id: 1, active: false }));
  });

  test("RF-19, RF-8: Activar a slot that overlaps an active one says with which, and saves nothing", async () => {
    mockSlots.current = {
      ...mockSlots.current,
      data: [slot({ id: 1, active: false }), slot({ id: 4, starts_at: "10:00:00", ends_at: "12:00:00" })],
    };
    await render(<Schedule />);
    await openMenu("Opciones de lunes 9 a 11 h");
    await pressInAlert("Activar");
    expect(alert).toHaveBeenLastCalledWith("No se pudo activar", "Se superpone con 10 a 12 h");
    expect(mockSave.mutateAsync).not.toHaveBeenCalled();
  });

  test("RF-19, RF-16: when the base refuses the change, it says why", async () => {
    mockSave.mutateAsync = jest.fn().mockRejectedValue({ code: "", message: "TypeError: Network request failed", hint: null });
    await render(<Schedule />);
    await openMenu("Opciones de domingo 9:30 a 12 h");
    await pressInAlert("Activar");
    expect(alert).toHaveBeenLastCalledWith("No se pudo guardar", "No hay conexión. Revisá tu internet e intentá de nuevo");
  });

  test("RF-20, RF-21: Eliminar asks, and confirming deletes the slot", async () => {
    await render(<Schedule />);
    await openMenu("Opciones de lunes 9 a 11 h");
    await pressInAlert("Eliminar");
    expect(lastAlert().title).toBe("¿Eliminar la franja del lunes de 9 a 11 h?");
    expect(lastAlert().message).toBe("No se puede deshacer.");
    expect(lastAlert().buttons.map((button) => button.text)).toEqual(["Cancelar", "Eliminar"]);
    await pressInAlert("Eliminar");
    expect(mockArchive.mutateAsync).toHaveBeenCalledWith(1);
  });

  test("RF-22: a slot with orders in progress is not deleted, and it says how many", async () => {
    mockArchive.mutateAsync = jest.fn().mockRejectedValue({ code: "P0001", message: "slot_has_active_orders", hint: "2" });
    await render(<Schedule />);
    await openMenu("Opciones de lunes 9 a 11 h");
    await pressInAlert("Eliminar");
    await pressInAlert("Eliminar");
    expect(alert).toHaveBeenLastCalledWith("No se pudo eliminar", "Tiene 2 pedidos en curso");
  });

  test("no slots at all", async () => {
    mockSlots.current = { ...mockSlots.current, data: [] };
    await render(<Schedule />);
    expect(screen.getByText("Todavía no hay franjas")).toBeOnTheScreen();
  });

  test("while loading, and when it fails, with retry", async () => {
    mockSlots.current = { ...mockSlots.current, data: undefined, isPending: true };
    const view = await render(<Schedule />);
    expect(screen.getByLabelText("Cargando")).toBeOnTheScreen();
    mockSlots.current = { ...mockSlots.current, isPending: false, isError: true };
    await view.rerender(<Schedule />);
    await fireEvent.press(screen.getByRole("button", { name: "Reintentar" }));
    expect(mockSlots.current.refetch).toHaveBeenCalled();
  });
});

import { act } from "@testing-library/react-native";
import { Alert, type AlertButton } from "react-native";

import { deleteOption } from "@/components/delete-option";

// "Eliminar" of every "⋮" menu (spec 003, RF-44 to RF-49; spec 009, cambio del 2026-11-19, RF-20 to
// RF-22): it asks, and when the base refuses it says why, with the messages of its list.
const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});

beforeEach(() => alert.mockClear());

const buttonsOf = (call: number) => (alert.mock.calls[call][2] ?? []) as AlertButton[];
const press = async (buttons: AlertButton[], text: string) => {
  await act(async () => buttons.find((button) => button.text === text)?.onPress?.());
};

describe("deleteOption", () => {
  test("asks before deleting, and confirming deletes", async () => {
    const remove = jest.fn().mockResolvedValue(undefined);
    await press([deleteOption("la franja del lunes de 9 a 11 h", remove)], "Eliminar");
    expect(alert).toHaveBeenLastCalledWith("¿Eliminar la franja del lunes de 9 a 11 h?", "No se puede deshacer.", expect.any(Array));
    expect(buttonsOf(0).map((button) => button.text)).toEqual(["Cancelar", "Eliminar"]);
    await press(buttonsOf(0), "Eliminar");
    expect(remove).toHaveBeenCalledTimes(1);
  });

  test("a refusal says why with the catalog messages by default", async () => {
    const remove = jest.fn().mockRejectedValue({ code: "P0001", message: "product_in_active_order", details: null, hint: null });
    await press([deleteOption("Maple Medianos", remove)], "Eliminar");
    await press(buttonsOf(0), "Eliminar");
    expect(alert).toHaveBeenLastCalledWith("No se pudo eliminar", "Tiene pedidos en curso");
  });

  test("spec 009, RF-22: or with the messages of its list", async () => {
    const remove = jest.fn().mockRejectedValue({ code: "P0001", message: "slot_has_active_orders", details: null, hint: "2" });
    const message = jest.fn(() => "Tiene 2 pedidos en curso");
    await press([deleteOption("la franja del lunes de 9 a 11 h", remove, message)], "Eliminar");
    await press(buttonsOf(0), "Eliminar");
    expect(alert).toHaveBeenLastCalledWith("No se pudo eliminar", "Tiene 2 pedidos en curso");
  });
});

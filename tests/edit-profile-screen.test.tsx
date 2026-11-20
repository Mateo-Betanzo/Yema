import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Alert, type AlertButton } from "react-native";

import EditProfile from "@/app/client/edit-profile";

// Spec 010 · T7: "Editar perfil" of the client (RF-23 to RF-25, RF-27, RF-28). The session and the save
// (useUpdateProfile, tested in profile-hooks.test.tsx) are replaced; the rules are the real ones of the
// sign-up (validateProfile). usePreventRemove of expo-router records what the screen asked and lets a
// test play the blocked way out, as in counter-sale-screen.test.tsx.
const ANA = {
  id: "00000000-0000-0000-0000-0000000000a1",
  first_name: "Ana",
  last_name: "Pérez",
  phone: "1133445566",
  address: "Calle 1",
  address_notes: null,
  role: "client",
};
jest.mock("@/lib/session", () => ({ useSession: () => ({ profile: ANA, email: "ana@example.com" }) }));

const mockUpdate = { mutateAsync: jest.fn(), isPending: false };
jest.mock("@/lib/profile", () => ({ useUpdateProfile: () => mockUpdate }));

type Blocked = { data: { action: unknown }; repeat: () => void };
const mockPrevent: { active: boolean; callback?: (blocked: Blocked) => void } = { active: false };
const mockDisable = jest.fn();
const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  router: { back: (...args: unknown[]) => mockBack(...args) },
  usePreventRemove: (active: boolean, callback: (blocked: Blocked) => void) => {
    mockPrevent.active = active;
    mockPrevent.callback = callback;
    return mockDisable;
  },
}));

const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});

beforeEach(() => {
  mockUpdate.mutateAsync = jest.fn().mockResolvedValue(ANA);
  mockUpdate.isPending = false;
  mockPrevent.active = false;
  mockDisable.mockClear();
  mockBack.mockClear();
  alert.mockClear();
});

const field = (label: string) => screen.getByLabelText(label);
const type = (label: string, text: string) => fireEvent.changeText(field(label), text);
const save = () => fireEvent.press(screen.getByRole("button", { name: "Guardar" }));
const lastAlert = () => {
  const [title, , buttons] = alert.mock.calls[alert.mock.calls.length - 1];
  return { title, buttons: (buttons ?? []) as AlertButton[] };
};

describe("Editar perfil", () => {
  test("RF-23: titled Editar perfil, with back, and the fields loaded with the current data", async () => {
    await render(<EditProfile />);
    expect(screen.getByRole("header", { name: "Editar perfil" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Volver" })).toBeOnTheScreen();
    expect(field("Nombre").props.value).toBe("Ana");
    expect(field("Apellido").props.value).toBe("Pérez");
    expect(field("Teléfono").props.value).toBe("1133445566");
    expect(field("Dirección").props.value).toBe("Calle 1");
    expect(field("Referencias (opcional)").props.value).toBe("");
  });

  test("RF-23: the email is neither shown nor edited", async () => {
    await render(<EditProfile />);
    expect(screen.queryByLabelText("Email")).toBeNull();
    expect(screen.queryByText("ana@example.com")).toBeNull();
  });

  test("RF-24: an invalid field shows the sign-up message below it and nothing is saved", async () => {
    await render(<EditProfile />);
    await type("Nombre", "  ");
    await type("Teléfono", "011 3344 5566");
    await save();
    expect(screen.getByText("Completá este campo")).toBeOnTheScreen();
    expect(screen.getByText("Ingresá 10 dígitos con el código de área, sin 0 ni 15. Ej.: 11 3344 5566")).toBeOnTheScreen();
    expect(mockUpdate.mutateAsync).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
  });

  test("RF-24: fixing a field takes its message away", async () => {
    await render(<EditProfile />);
    await type("Nombre", "");
    await save();
    await type("Nombre", "Anabel");
    expect(screen.queryByText("Completá este campo")).toBeNull();
  });

  test("RF-25: Guardar saves the data normalized and goes back to the Perfil without asking", async () => {
    await render(<EditProfile />);
    await type("Teléfono", "11 9988-7766");
    await type("Dirección", "  Calle 2 ");
    await type("Referencias (opcional)", "Timbre B");
    await save();
    expect(mockUpdate.mutateAsync).toHaveBeenCalledWith({
      first_name: "Ana",
      last_name: "Pérez",
      phone: "1199887766",
      address: "Calle 2",
      address_notes: "Timbre B",
    });
    expect(mockDisable).toHaveBeenCalled();
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(alert).not.toHaveBeenCalled();
  });

  test("RF-28: without connection, the notice, and what was typed stays on the screen", async () => {
    mockUpdate.mutateAsync = jest.fn().mockRejectedValue({ code: "", message: "TypeError: Network request failed" });
    await render(<EditProfile />);
    await type("Dirección", "Calle 2");
    await save();
    expect(alert).toHaveBeenCalledWith("No hay conexión. Revisá tu internet e intentá de nuevo");
    expect(mockBack).not.toHaveBeenCalled();
    expect(field("Dirección").props.value).toBe("Calle 2");
  });

  test("RF-28: any other error, the generic notice", async () => {
    mockUpdate.mutateAsync = jest.fn().mockRejectedValue({ code: "42501", message: "permission denied" });
    await render(<EditProfile />);
    await type("Dirección", "Calle 2");
    await save();
    expect(alert).toHaveBeenCalledWith("No pudimos guardar tus datos. Intentá de nuevo");
    expect(mockBack).not.toHaveBeenCalled();
  });

  test("RF-27: leaving asks only with changes; Seguir editando stays and Descartar leaves", async () => {
    await render(<EditProfile />);
    expect(mockPrevent.active).toBe(false);

    await type("Apellido", "Gómez");
    expect(mockPrevent.active).toBe(true);
    const repeat = jest.fn();
    await act(async () => mockPrevent.callback?.({ data: { action: { type: "GO_BACK" } }, repeat }));
    expect(lastAlert().title).toBe("¿Descartar los cambios?");
    expect(lastAlert().buttons.map((button) => button.text)).toEqual(["Seguir editando", "Descartar"]);

    await act(async () => lastAlert().buttons.find((button) => button.text === "Seguir editando")?.onPress?.());
    expect(repeat).not.toHaveBeenCalled();
    await act(async () => lastAlert().buttons.find((button) => button.text === "Descartar")?.onPress?.());
    expect(repeat).toHaveBeenCalledTimes(1);

    await type("Apellido", "Pérez");
    expect(mockPrevent.active).toBe(false);
  });

  test("while saving, Guardar is disabled and busy, and a second tap saves nothing", async () => {
    let finish: (value: unknown) => void = () => {};
    mockUpdate.mutateAsync = jest.fn(() => new Promise((resolve) => (finish = resolve)));
    await render(<EditProfile />);
    await type("Dirección", "Calle 2");
    // fireEvent.press waits for onPress, which stays pending here: the first tap is not awaited (as the
    // sign-up, spec 002 RF-20).
    const firstTap = save();
    const button = screen.getByRole("button", { name: "Guardar" });
    await waitFor(() => expect(button).toBeDisabled());
    expect(button).toBeBusy();
    void save();
    expect(mockUpdate.mutateAsync).toHaveBeenCalledTimes(1);

    await act(async () => finish(ANA));
    await firstTap;
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});

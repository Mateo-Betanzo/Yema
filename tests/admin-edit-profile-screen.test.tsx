import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Alert, type AlertButton } from "react-native";

import EditProfile from "@/app/admin/edit-profile";

// Spec 011 · T7: "Editar perfil" of the admin (RF-16 to RF-20), the client's form (spec 010) with the
// admin rules (validateAdminProfile: the contact is optional). The session and the save
// (useUpdateProfile, tested in profile-hooks.test.tsx) are replaced. usePreventRemove of expo-router
// records what the screen asked and lets a test play the blocked way out, as in edit-profile-screen.
const ADMIN = {
  id: "00000000-0000-0000-0000-0000000000c3",
  first_name: "Mateo",
  last_name: "Admin",
  phone: null,
  address: null,
  address_notes: null,
  role: "admin",
};
jest.mock("@/lib/session", () => ({ useSession: () => ({ profile: ADMIN, email: "admin@example.com" }) }));

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
  mockUpdate.mutateAsync = jest.fn().mockResolvedValue(ADMIN);
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

describe("Editar perfil del admin", () => {
  test("RF-16: titled Editar perfil, with back, the five fields loaded and empty what is missing", async () => {
    await render(<EditProfile />);
    expect(screen.getByRole("header", { name: "Editar perfil" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Volver" })).toBeOnTheScreen();
    expect(field("Nombre").props.value).toBe("Mateo");
    expect(field("Apellido").props.value).toBe("Admin");
    expect(field("Teléfono").props.value).toBe("");
    expect(field("Dirección").props.value).toBe("");
    expect(field("Referencias (opcional)").props.value).toBe("");
  });

  test("RF-16: the email is neither shown nor edited", async () => {
    await render(<EditProfile />);
    expect(screen.queryByLabelText("Email")).toBeNull();
    expect(screen.queryByText("admin@example.com")).toBeNull();
  });

  test("RF-17, RF-18: Guardar with the contact empty saves it as null and goes back", async () => {
    await render(<EditProfile />);
    await type("Nombre", "  Mateo José ");
    await save();
    expect(mockUpdate.mutateAsync).toHaveBeenCalledWith({
      first_name: "Mateo José",
      last_name: "Admin",
      phone: null,
      address: null,
      address_notes: null,
    });
    expect(mockDisable).toHaveBeenCalled();
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(alert).not.toHaveBeenCalled();
  });

  test("RF-18: a contact that is filled in is saved normalized; only spaces or hyphens are empty", async () => {
    await render(<EditProfile />);
    await type("Teléfono", "11 9988-7766");
    await type("Dirección", "  Calle 2 ");
    await type("Referencias (opcional)", "   ");
    await save();
    expect(mockUpdate.mutateAsync).toHaveBeenCalledWith({
      first_name: "Mateo",
      last_name: "Admin",
      phone: "1199887766",
      address: "Calle 2",
      address_notes: null,
    });
  });

  test("RF-17: the name is still required and a filled-in phone follows the sign-up rule", async () => {
    await render(<EditProfile />);
    await type("Nombre", " ");
    await type("Teléfono", "011 3344 5566");
    await save();
    expect(screen.getByText("Completá este campo")).toBeOnTheScreen();
    expect(screen.getByText("Ingresá 10 dígitos con el código de área, sin 0 ni 15. Ej.: 11 3344 5566")).toBeOnTheScreen();
    expect(mockUpdate.mutateAsync).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
  });

  test("RF-19: leaving with changes asks; Descartar leaves", async () => {
    await render(<EditProfile />);
    expect(mockPrevent.active).toBe(false);
    await type("Dirección", "Calle 2");
    expect(mockPrevent.active).toBe(true);
    const repeat = jest.fn();
    await act(async () => mockPrevent.callback?.({ data: { action: { type: "GO_BACK" } }, repeat }));
    expect(lastAlert().title).toBe("¿Descartar los cambios?");
    expect(lastAlert().buttons.map((button) => button.text)).toEqual(["Seguir editando", "Descartar"]);
    await act(async () => lastAlert().buttons.find((button) => button.text === "Descartar")?.onPress?.());
    expect(repeat).toHaveBeenCalledTimes(1);
  });

  test("RF-20: without connection, the notice, and what was typed stays on the screen", async () => {
    mockUpdate.mutateAsync = jest.fn().mockRejectedValue({ code: "", message: "TypeError: Network request failed" });
    await render(<EditProfile />);
    await type("Dirección", "Calle 2");
    await save();
    expect(alert).toHaveBeenCalledWith("No hay conexión. Revisá tu internet e intentá de nuevo");
    expect(mockBack).not.toHaveBeenCalled();
    expect(field("Dirección").props.value).toBe("Calle 2");
  });

  test("RF-20: any other error, the generic notice", async () => {
    mockUpdate.mutateAsync = jest.fn().mockRejectedValue({ code: "42501", message: "permission denied" });
    await render(<EditProfile />);
    await type("Dirección", "Calle 2");
    await save();
    expect(alert).toHaveBeenCalledWith("No pudimos guardar tus datos. Intentá de nuevo");
    expect(mockBack).not.toHaveBeenCalled();
  });
});

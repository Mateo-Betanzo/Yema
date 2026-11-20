import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Alert, type AlertButton } from "react-native";

import AdminMenu from "@/app/admin/menu";

// Spec 011 · T8: the menu of the admin Perfil (RF-2, RF-5, RF-7, RF-8, RF-21), on ProfileMenu (its
// behavior is tested in profile-menu.test.tsx). The router and the session are replaced: each option
// closes the sheet (back) and then opens its screen. The sheet itself is checked in Expo Go.
const mockCalls: string[] = [];
const mockSignOut = jest.fn(async () => {
  mockCalls.push("signOut");
});
jest.mock("@/lib/session", () => ({ useSession: () => ({ signOut: mockSignOut }) }));
jest.mock("expo-router", () => ({
  router: {
    back: () => mockCalls.push("back"),
    push: (href: string) => mockCalls.push(`push ${href}`),
  },
}));

const alert = jest.spyOn(Alert, "alert").mockImplementation((title) => {
  mockCalls.push(`alert ${title}`);
});

beforeEach(() => {
  mockCalls.length = 0;
  mockSignOut.mockClear();
  alert.mockClear();
});

const option = (name: string) => screen.getByRole("button", { name });

describe("admin menu", () => {
  test("RF-2: five options in this order, each with its icon", async () => {
    await render(<AdminMenu />);
    expect(screen.getAllByRole("button").map((button) => button.props.accessibilityLabel)).toEqual([
      "Tipos y formatos",
      "Agenda de reparto",
      "Historial de stock",
      "Editar perfil",
      "Cerrar sesión",
    ]);
    for (const name of ["list", "calendar", "clock", "edit-pencil", "log-out"]) {
      expect(screen.getByTestId(`icon:${name}`, { includeHiddenElements: true })).toBeOnTheScreen();
    }
  });

  test.each([
    ["Tipos y formatos", "/admin/catalog-setup"],
    ["Agenda de reparto", "/admin/schedule"],
    ["Historial de stock", "/admin/stock-history"],
    ["Editar perfil", "/admin/edit-profile"],
  ])("RF-5, RF-7, RF-8: %s closes the menu and opens %s", async (name, href) => {
    await render(<AdminMenu />);
    await fireEvent.press(option(name));
    expect(mockCalls).toEqual(["back", `push ${href}`]);
  });

  test("RF-21: Cerrar sesión closes the menu and asks; confirming signs out", async () => {
    await render(<AdminMenu />);
    await fireEvent.press(option("Cerrar sesión"));
    expect(mockCalls).toEqual(["back", "alert ¿Cerrar sesión?"]);
    const buttons = (alert.mock.calls[0][2] ?? []) as AlertButton[];
    expect(buttons.map((button) => button.text)).toEqual(["Cancelar", "Cerrar sesión"]);
    await act(async () => buttons.find((button) => button.text === "Cerrar sesión")?.onPress?.());
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });
});

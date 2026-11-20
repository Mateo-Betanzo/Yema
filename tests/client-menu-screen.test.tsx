import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Alert, type AlertButton } from "react-native";

import ClientMenu from "@/app/client/menu";

// Spec 010 · T8: the menu of the Perfil, a native sheet (RF-17, RF-20, RF-29). The router and the session
// are replaced: each option closes the sheet (back) and then does its thing. Opening, dimming, dragging
// and "atrás" of Android are the native sheet's (checked in Expo Go, T9).
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
const lastAlert = () => {
  const [title, , buttons] = alert.mock.calls[alert.mock.calls.length - 1];
  return { title, buttons: (buttons ?? []) as AlertButton[] };
};
const pressInAlert = async (text: string) => {
  await act(async () => lastAlert().buttons.find((button) => button.text === text)?.onPress?.());
};

describe("client menu", () => {
  test("RF-17: three options in this order, each at least 48 pt", async () => {
    await render(<ClientMenu />);
    const options = screen.getAllByRole("button");
    expect(options.map((button) => button.props.accessibilityLabel)).toEqual([
      "Historial de compras",
      "Editar perfil",
      "Cerrar sesión",
    ]);
    for (const button of options) expect(button).toHaveStyle({ minHeight: 56 });
  });

  test("RF-20, RF-21: Historial de compras closes the menu and opens the history", async () => {
    await render(<ClientMenu />);
    await fireEvent.press(option("Historial de compras"));
    expect(mockCalls).toEqual(["back", "push /client/history"]);
  });

  test("RF-20, RF-23: Editar perfil closes the menu and opens the form", async () => {
    await render(<ClientMenu />);
    await fireEvent.press(option("Editar perfil"));
    expect(mockCalls).toEqual(["back", "push /client/edit-profile"]);
  });

  test("RF-29: Cerrar sesión closes the menu and asks; Cancelar keeps the session", async () => {
    await render(<ClientMenu />);
    await fireEvent.press(option("Cerrar sesión"));
    expect(mockCalls).toEqual(["back", "alert ¿Cerrar sesión?"]);
    expect(lastAlert().buttons.map((button) => button.text)).toEqual(["Cancelar", "Cerrar sesión"]);
    await pressInAlert("Cancelar");
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  test("RF-29: confirming signs out once", async () => {
    await render(<ClientMenu />);
    await fireEvent.press(option("Cerrar sesión"));
    await pressInAlert("Cerrar sesión");
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  test("two quick taps do one thing: after the first, the options are disabled", async () => {
    await render(<ClientMenu />);
    await fireEvent.press(option("Historial de compras"));
    await fireEvent.press(option("Editar perfil"));
    await fireEvent.press(option("Historial de compras"));
    expect(mockCalls).toEqual(["back", "push /client/history"]);
    for (const name of ["Historial de compras", "Editar perfil", "Cerrar sesión"]) expect(option(name)).toBeDisabled();
  });

  test("each option with its SVG icon: clock, edit-pencil and log-out", async () => {
    await render(<ClientMenu />);
    for (const name of ["clock", "edit-pencil", "log-out"]) {
      expect(screen.getByTestId(`icon:${name}`, { includeHiddenElements: true })).toBeOnTheScreen();
    }
  });
});

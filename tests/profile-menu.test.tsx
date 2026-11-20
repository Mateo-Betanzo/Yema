import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Alert, type AlertButton } from "react-native";

import { ProfileMenu } from "@/components/profile-menu";
import { profileMenuOptions } from "@/components/profile-menu-options";

// Spec 011 · T5: the menu of the Perfil shared by both roles (RF-2 to RF-5, RF-21; the client's of spec
// 010). The router and the session are replaced: each option closes the sheet (back) and then does its
// thing. Opening, dimming, dragging and "atrás" of Android are the native sheet's (checked in Expo Go).
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

const LINKS = [
  { label: "Tipos y formatos", icon: "list", href: "/admin/catalog-setup" },
  { label: "Agenda de reparto", icon: "calendar", href: "/admin/schedule" },
] as const;

const option = (name: string) => screen.getByRole("button", { name });
const lastAlert = () => {
  const [title, , buttons] = alert.mock.calls[alert.mock.calls.length - 1];
  return { title, buttons: (buttons ?? []) as AlertButton[] };
};
const pressInAlert = async (text: string) => {
  await act(async () => lastAlert().buttons.find((button) => button.text === text)?.onPress?.());
};

describe("ProfileMenu", () => {
  test("RF-2: the links in their order and Cerrar sesión last, each row at least 56 pt", async () => {
    await render(<ProfileMenu links={LINKS} />);
    const options = screen.getAllByRole("button");
    expect(options.map((button) => button.props.accessibilityLabel)).toEqual([
      "Tipos y formatos",
      "Agenda de reparto",
      "Cerrar sesión",
    ]);
    for (const button of options) expect(button).toHaveStyle({ minHeight: 56 });
  });

  test("RF-2: each option with its icon; Cerrar sesión with log-out", async () => {
    await render(<ProfileMenu links={LINKS} />);
    for (const name of ["list", "calendar", "log-out"]) {
      expect(screen.getByTestId(`icon:${name}`, { includeHiddenElements: true })).toBeOnTheScreen();
    }
  });

  test("RF-5: a link closes the menu and then opens its screen", async () => {
    await render(<ProfileMenu links={LINKS} />);
    await fireEvent.press(option("Agenda de reparto"));
    expect(mockCalls).toEqual(["back", "push /admin/schedule"]);
  });

  test("RF-5: two quick taps do one thing: after the first, every option is disabled", async () => {
    await render(<ProfileMenu links={LINKS} />);
    await fireEvent.press(option("Tipos y formatos"));
    await fireEvent.press(option("Agenda de reparto"));
    await fireEvent.press(option("Cerrar sesión"));
    expect(mockCalls).toEqual(["back", "push /admin/catalog-setup"]);
    for (const name of ["Tipos y formatos", "Agenda de reparto", "Cerrar sesión"]) expect(option(name)).toBeDisabled();
  });

  test("RF-21: Cerrar sesión closes the menu and asks; Cancelar keeps the session", async () => {
    await render(<ProfileMenu links={LINKS} />);
    await fireEvent.press(option("Cerrar sesión"));
    expect(mockCalls).toEqual(["back", "alert ¿Cerrar sesión?"]);
    expect(lastAlert().buttons.map((button) => button.text)).toEqual(["Cancelar", "Cerrar sesión"]);
    await pressInAlert("Cancelar");
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  test("RF-21: confirming signs out once", async () => {
    await render(<ProfileMenu links={LINKS} />);
    await fireEvent.press(option("Cerrar sesión"));
    await pressInAlert("Cerrar sesión");
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });
});

describe("profileMenuOptions", () => {
  test("RF-2: a form sheet as tall as its content, with a grabber, that slides as usual", () => {
    expect(profileMenuOptions(false)).toMatchObject({
      presentation: "formSheet",
      sheetAllowedDetents: "fitToContents",
      sheetGrabberVisible: true,
      animation: "default",
    });
  });

  test("RF-4: with Reduce motion, it opens and closes without sliding", () => {
    expect(profileMenuOptions(true)).toMatchObject({ presentation: "formSheet", animation: "none" });
  });
});

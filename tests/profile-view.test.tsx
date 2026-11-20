import { fireEvent, render, screen } from "@testing-library/react-native";

import AdminProfile from "@/app/admin/(tabs)/profile";
import { ProfileView } from "@/components/profile-view";
import type { Profile } from "@/lib/session";
import { theme } from "@/theme";

// Spec 002 · T9: Perfil (RF-29). Spec 010 · T8: the client opens a menu (RF-16). Spec 011 · T8: the admin
// too, with "Cerrar sesión" inside it (RF-1).
const CLIENT: Profile = {
  id: "00000000-0000-0000-0000-0000000000a1",
  first_name: "Ana",
  last_name: "Pérez",
  phone: "1133445566",
  address: 'Av. Rivadavia 4521, piso 3 "B"',
  address_notes: "Timbre B",
  role: "client",
  created_at: "2026-11-06T00:00:00Z",
  updated_at: "2026-11-06T00:00:00Z",
};
const ADMIN: Profile = { ...CLIENT, role: "admin", phone: null, address: null, address_notes: null };

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ router: { back: jest.fn(), push: (href: string) => mockPush(href) } }));
const mockSession = { current: { profile: ADMIN, email: "admin@example.com" } };
jest.mock("@/lib/session", () => ({ useSession: () => mockSession.current }));

describe("profile view", () => {
  // /feature 2026-11-18: the title of the Perfil is the one of every other screen (ScreenHeader).
  test("the title is the one of the Home: 32 pt regular in a 48 pt row, without back", async () => {
    await render(<ProfileView profile={CLIENT} email="ana@example.com" onMenu={() => {}} />);
    expect(screen.getByRole("header", { name: "Perfil" })).toHaveStyle({
      fontSize: theme.typography.sizes.xxl,
      fontWeight: theme.typography.weights.regular,
    });
    expect(screen.queryByRole("button", { name: "Volver" })).toBeNull();
  });

  test("RF-29: shows the name, email, phone, address and references", async () => {
    await render(<ProfileView profile={CLIENT} email="ana@example.com" onMenu={() => {}} />);
    expect(screen.getByRole("header", { name: "Perfil" })).toBeOnTheScreen();
    expect(screen.getByText("Ana Pérez")).toBeOnTheScreen();
    expect(screen.getByText("ana@example.com")).toBeOnTheScreen();
    expect(screen.getByText("1133445566")).toBeOnTheScreen();
    expect(screen.getByText('Av. Rivadavia 4521, piso 3 "B"')).toBeOnTheScreen();
    expect(screen.getByText("Timbre B")).toBeOnTheScreen();
  });

  test("RF-29: leaves out the empty data (the admin may have no phone or address)", async () => {
    await render(<ProfileView profile={ADMIN} email="admin@example.com" onMenu={() => {}} />);
    expect(screen.getByText("Ana Pérez")).toBeOnTheScreen();
    expect(screen.getByText("admin@example.com")).toBeOnTheScreen();
    for (const label of ["Teléfono", "Dirección", "Referencias"]) expect(screen.queryByText(label)).toBeNull();
  });

  test("spec 010, RF-16: for the client, an Abrir menú button of 48 pt and no Cerrar sesión on the screen", async () => {
    const onMenu = jest.fn();
    await render(<ProfileView profile={CLIENT} email="ana@example.com" onMenu={onMenu} />);
    expect(screen.getByRole("header", { name: "Perfil" })).toBeOnTheScreen();
    expect(screen.getByText("Ana Pérez")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Cerrar sesión" })).toBeNull();
    const menu = screen.getByRole("button", { name: "Abrir menú" });
    // The action of the header (ScreenHeader), the same as the cart of the Home: 48 pt with the SVG.
    expect(menu).toHaveStyle({ width: 48, height: 48 });
    expect(screen.getByTestId("icon:menu", { includeHiddenElements: true })).toBeOnTheScreen();
    await fireEvent.press(menu);
    expect(onMenu).toHaveBeenCalledTimes(1);
  });

  test("spec 011, RF-1: the Perfil of the admin opens the menu and has no Cerrar sesión on the screen", async () => {
    mockPush.mockClear();
    await render(<AdminProfile />);
    expect(screen.getByText("Ana Pérez")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Cerrar sesión" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Abrir menú" }));
    expect(mockPush).toHaveBeenCalledWith("/admin/menu");
  });
});

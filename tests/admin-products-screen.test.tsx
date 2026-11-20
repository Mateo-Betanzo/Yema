import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import { Alert, type AlertButton } from "react-native";

import Products from "@/app/admin/(tabs)/products";

// Spec 003 · T8: the Productos tab (RF-15, RF-16, RF-17, RF-25). Spec 004 · T11: the Stock list reads
// egg_type_overview and says how many eggs are missing for the active orders (RF-38). The catalog hooks
// are replaced.
type Query<T> = { data?: T; isPending: boolean; isError: boolean; refetch: jest.Mock };

const product = (fields: Record<string, unknown>) => ({
  egg_type_id: 1,
  format_id: 2,
  description: null,
  active: true,
  type_name: "Medianos",
  format_name: "Pack",
  status: "visible",
  units_available: 2,
  ...fields,
});
const PRODUCTS = [
  product({ id: 1, name: "Pack Mediano", price: 10500, description: "6 maples medianos" }),
  product({ id: 2, name: "Maple Grande", price: 4000, type_name: "Grandes", format_name: "Maple", units_available: 0 }),
  product({ id: 3, name: "Maple Mediano", price: 3500, format_name: "Maple", active: false, status: "inactive" }),
  product({ id: 4, name: "Maple Cajitas", price: 3800, type_name: "Cajitas", status: "type_inactive" }),
];

const mockOverview: { current: Query<typeof PRODUCTS> } = {
  current: { data: PRODUCTS, isPending: false, isError: false, refetch: jest.fn() },
};
const mockSaveProduct = jest.fn(async (_input: unknown) => undefined);
const mockArchiveProduct = jest.fn(async (_id: number): Promise<unknown> => undefined);
const mockPush = jest.fn();

const TYPES = [
  { id: 1, name: "Medianos", active: true, stock: 375, reserved_eggs: 180, shortfall: 0 },
  { id: 2, name: "Cajitas", active: false, stock: 30, reserved_eggs: 60, shortfall: 30 },
];

jest.mock("@/lib/catalog", () => ({
  useProductOverview: () => mockOverview.current,
  useSaveProduct: () => ({ mutateAsync: mockSaveProduct, isPending: false }),
  useArchiveProduct: () => ({ mutateAsync: mockArchiveProduct, isPending: false }),
  useStockOverview: () => ({ data: TYPES, isPending: false, isError: false, refetch: jest.fn() }),
}));
jest.mock("expo-router", () => ({ router: { push: (href: unknown) => mockPush(href) } }));

const alert = jest.spyOn(Alert, "alert");
async function chooseInAlert(text: string) {
  const buttons = (alert.mock.lastCall?.[2] ?? []) as AlertButton[];
  const button = buttons.find((b) => b.text === text);
  if (!button) throw new Error(`No "${text}" in the alert: ${buttons.map((b) => b.text).join(", ")}`);
  await act(async () => button.onPress?.());
}

beforeEach(() => {
  jest.clearAllMocks();
  alert.mockImplementation(() => {});
  mockOverview.current = { data: PRODUCTS, isPending: false, isError: false, refetch: jest.fn() };
});

describe("Productos tab", () => {
  test("RF-25: the selector starts on Productos", async () => {
    await render(<Products />);
    expect(screen.getByRole("header", { name: "Productos" })).toBeOnTheScreen();
    expect(screen.getByRole("tab", { name: "Productos" })).toBeSelected();
    expect(screen.getByRole("tab", { name: "Stock" })).not.toBeSelected();
  });

  test("spec 011, RF-6: Tipos y formatos and Agenda de reparto moved to the menu of the Perfil", async () => {
    await render(<Products />);
    expect(screen.queryByRole("button", { name: "Tipos y formatos" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Agenda de reparto" })).toBeNull();
    await fireEvent.press(screen.getByRole("tab", { name: "Stock" }));
    expect(screen.queryByRole("button", { name: "Tipos y formatos" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Agenda de reparto" })).toBeNull();
  });

  test("spec 009, RF-26, RF-27: each product card is one button Opciones de <nombre>, with its texts and the ⋮", async () => {
    await render(<Products />);
    const cards = screen.getAllByRole("button", { name: /^Opciones de / });
    expect(cards).toHaveLength(PRODUCTS.length);
    const card = screen.getByRole("button", { name: "Opciones de Pack Mediano" });
    expect(within(card).getByText("Pack Mediano")).toBeOnTheScreen();
    expect(within(card).getByText("$10.500")).toBeOnTheScreen();
    expect(within(card).getByTestId("icon:more-vert", { includeHiddenElements: true })).toBeOnTheScreen();
  });

  test("on Android, where Cancelar does not fit, the menu closes by tapping outside or going back", async () => {
    await render(<Products />);
    await fireEvent.press(screen.getByRole("button", { name: "Opciones de Pack Mediano" }));
    expect(alert.mock.calls[alert.mock.calls.length - 1][3]).toEqual({ cancelable: true });
  });

  test("RF-16: each product with its name, type and format, price, description and units", async () => {
    await render(<Products />);
    expect(screen.getByText("Pack Mediano")).toBeOnTheScreen();
    expect(screen.getAllByText("Medianos · Pack")).not.toHaveLength(0);
    expect(screen.getByText("$10.500")).toBeOnTheScreen();
    expect(screen.getByText("6 maples medianos")).toBeOnTheScreen();
    expect(screen.getAllByText("2 disponibles")).not.toHaveLength(0);
    expect(screen.getByText("Sin stock")).toBeOnTheScreen();
  });

  test("RF-17: inactive products and hidden ones say why, in text", async () => {
    await render(<Products />);
    expect(screen.getByText("Inactivo")).toBeOnTheScreen();
    expect(screen.getByText("No visible: tipo inactivo")).toBeOnTheScreen();
  });

  test("RF-11: the + opens a new product", async () => {
    await render(<Products />);
    await fireEvent.press(screen.getByRole("button", { name: "Nuevo producto" }));
    expect(mockPush).toHaveBeenCalledWith("/admin/product-form");
  });

  test("RF-14: Editar opens the product", async () => {
    await render(<Products />);
    await fireEvent.press(screen.getByRole("button", { name: "Opciones de Pack Mediano" }));
    await chooseInAlert("Editar");
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/admin/product-form", params: { id: "1" } });
  });

  test("RF-15: a product is deactivated, and an inactive one offers Activar", async () => {
    await render(<Products />);
    await fireEvent.press(screen.getByRole("button", { name: "Opciones de Pack Mediano" }));
    await chooseInAlert("Desactivar");
    expect(mockSaveProduct).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 1, name: "Pack Mediano", price: 10500, active: false }),
    );
    await fireEvent.press(screen.getByRole("button", { name: "Opciones de Maple Mediano" }));
    await chooseInAlert("Activar");
    expect(mockSaveProduct).toHaveBeenLastCalledWith(expect.objectContaining({ id: 3, active: true }));
  });

  // Cambio del RF-34 (2026-11-18): "Eliminar" archives, after asking (RF-44, RF-45, RF-47).
  test("RF-44: Eliminar is the last option, destructive, and asks first; Cancelar keeps the product", async () => {
    await render(<Products />);
    await fireEvent.press(screen.getByRole("button", { name: "Opciones de Pack Mediano" }));
    const options = (alert.mock.lastCall?.[2] ?? []) as AlertButton[];
    expect(options.map((option) => option.text)).toEqual(["Editar", "Desactivar", "Eliminar", "Cancelar"]);
    expect(options.find((option) => option.text === "Eliminar")?.style).toBe("destructive");

    await chooseInAlert("Eliminar");
    expect(alert).toHaveBeenLastCalledWith("¿Eliminar Pack Mediano?", "No se puede deshacer.", expect.any(Array));
    await chooseInAlert("Cancelar");
    expect(mockArchiveProduct).not.toHaveBeenCalled();
  });

  test("RF-45: confirming archives the product; an inactive one can be deleted too", async () => {
    await render(<Products />);
    await fireEvent.press(screen.getByRole("button", { name: "Opciones de Maple Mediano" }));
    await chooseInAlert("Eliminar");
    await chooseInAlert("Eliminar");
    expect(mockArchiveProduct).toHaveBeenCalledWith(3);
  });

  test("RF-47: when the base refuses, it says why", async () => {
    mockArchiveProduct.mockRejectedValueOnce({ code: "P0001", message: "product_in_active_order", hint: null });
    await render(<Products />);
    await fireEvent.press(screen.getByRole("button", { name: "Opciones de Pack Mediano" }));
    await chooseInAlert("Eliminar");
    await chooseInAlert("Eliminar");
    expect(alert).toHaveBeenLastCalledWith("No se pudo eliminar", "Tiene pedidos en curso");
  });

  test("with no products yet, it says so", async () => {
    mockOverview.current = { data: [], isPending: false, isError: false, refetch: jest.fn() };
    await render(<Products />);
    expect(screen.getByText("Todavía no hay productos")).toBeOnTheScreen();
  });

  test("when the list fails, it can be retried", async () => {
    const refetch = jest.fn();
    mockOverview.current = { isPending: false, isError: true, refetch };
    await render(<Products />);
    await fireEvent.press(screen.getByRole("button", { name: "Reintentar" }));
    expect(refetch).toHaveBeenCalled();
  });

  test("RF-22: Stock shows every type, active or not, in maples equivalent and in eggs", async () => {
    await render(<Products />);
    await fireEvent.press(screen.getByRole("tab", { name: "Stock" }));
    expect(screen.getByRole("tab", { name: "Stock" })).toBeSelected();
    expect(screen.getByText("Medianos")).toBeOnTheScreen();
    expect(screen.getByText("12 maples y 15 huevos")).toBeOnTheScreen();
    expect(screen.getByText("375 huevos en total")).toBeOnTheScreen();
    expect(screen.getByText("1 maple")).toBeOnTheScreen();
    expect(screen.getByText("Inactivo")).toBeOnTheScreen();
  });

  test("RF-18, RF-19: each type opens its load and its adjustment", async () => {
    await render(<Products />);
    await fireEvent.press(screen.getByRole("tab", { name: "Stock" }));
    await fireEvent.press(screen.getByRole("button", { name: "Cargar Medianos" }));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: "/admin/stock-movement", params: { typeId: "1", kind: "load" } });
    await fireEvent.press(screen.getByRole("button", { name: "Ajustar Medianos" }));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: "/admin/stock-movement",
      params: { typeId: "1", kind: "adjustment" },
    });
  });

  test("spec 011, RF-9: a type has no history of its own; the Historial de stock lives in the menu of the Perfil", async () => {
    await render(<Products />);
    await fireEvent.press(screen.getByRole("tab", { name: "Stock" }));
    expect(screen.queryByRole("button", { name: /^Historial/ })).not.toBeOnTheScreen();
    expect(screen.queryByText("Historial")).not.toBeOnTheScreen();
  });

  test("RF-5: an inactive type can still be loaded and adjusted", async () => {
    await render(<Products />);
    await fireEvent.press(screen.getByRole("tab", { name: "Stock" }));
    expect(screen.getByRole("button", { name: "Cargar Cajitas" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Ajustar Cajitas" })).toBeEnabled();
  });

  test("spec 004, RF-38: a type with fewer eggs than its active orders reserve says how many are missing", async () => {
    await render(<Products />);
    await fireEvent.press(screen.getByRole("tab", { name: "Stock" }));
    expect(screen.getByText("Faltan 30 huevos para los pedidos en curso")).toBeOnTheScreen();
    expect(screen.getAllByText(/para los pedidos en curso/)).toHaveLength(1);
  });
});

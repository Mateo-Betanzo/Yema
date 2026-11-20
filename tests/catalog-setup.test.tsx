import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import { Alert, type AlertButton } from "react-native";

import CatalogSetup from "@/app/admin/catalog-setup";
import FormatForm from "@/app/admin/format-form";
import TypeForm from "@/app/admin/type-form";

// Spec 003 · T7: Tipos y formatos (RF-2 to RF-10). The catalog hooks are replaced: the screens are
// judged by what they show and what they ask to save. The menu is the system Alert, spied on.
type Query<T> = { data?: T; isPending: boolean; isError: boolean; refetch: jest.Mock };

const TYPES = [
  { id: 1, name: "Medianos", active: true, stock: 360 },
  { id: 2, name: "Cajitas", active: false, stock: 0 },
];
const FORMATS = [
  { id: 3, name: "Media docena", eggs: 6, active: true, is_load_format: false },
  { id: 1, name: "Maple", eggs: 30, active: false, is_load_format: false },
  { id: 2, name: "Pack", eggs: 180, active: true, is_load_format: true },
];

const mockQueries: { types: Query<typeof TYPES>; formats: Query<typeof FORMATS> } = {
  types: { data: TYPES, isPending: false, isError: false, refetch: jest.fn() },
  formats: { data: FORMATS, isPending: false, isError: false, refetch: jest.fn() },
};
const mockSaveType = jest.fn(async (_input: unknown) => undefined);
const mockSaveFormat = jest.fn(async (_input: unknown) => undefined);
const mockArchiveType = jest.fn(async (_id: number): Promise<unknown> => undefined);
const mockArchiveFormat = jest.fn(async (_id: number): Promise<unknown> => undefined);
const mockPush = jest.fn();
const mockBack = jest.fn();
let mockParams: { id?: string } = {};

jest.mock("@/lib/catalog", () => ({
  useEggTypes: () => mockQueries.types,
  useFormats: () => mockQueries.formats,
  useSaveType: () => ({ mutateAsync: mockSaveType, isPending: false }),
  useSaveFormat: () => ({ mutateAsync: mockSaveFormat, isPending: false }),
  useArchiveEggType: () => ({ mutateAsync: mockArchiveType, isPending: false }),
  useArchiveFormat: () => ({ mutateAsync: mockArchiveFormat, isPending: false }),
}));
jest.mock("expo-router", () => ({
  router: { push: (href: unknown) => mockPush(href), back: () => mockBack() },
  useLocalSearchParams: () => mockParams,
}));

const alert = jest.spyOn(Alert, "alert");

/** Presses a button of the last Alert (the "⋮" menu or a message). */
async function chooseInAlert(text: string) {
  const buttons = (alert.mock.lastCall?.[2] ?? []) as AlertButton[];
  const button = buttons.find((b) => b.text === text);
  if (!button) throw new Error(`No "${text}" in the alert: ${buttons.map((b) => b.text).join(", ")}`);
  await act(async () => button.onPress?.());
}

beforeEach(() => {
  jest.clearAllMocks();
  alert.mockImplementation(() => {});
  mockParams = {};
  mockQueries.types = { data: TYPES, isPending: false, isError: false, refetch: jest.fn() };
  mockQueries.formats = { data: FORMATS, isPending: false, isError: false, refetch: jest.fn() };
});

describe("Tipos y formatos", () => {
  test("lists types and formats, with the eggs, inactive ones and the load format marked in text", async () => {
    await render(<CatalogSetup />);
    expect(screen.getByRole("header", { name: "Tipos y formatos" })).toBeOnTheScreen();
    expect(screen.getByText("Medianos")).toBeOnTheScreen();
    expect(screen.getByText("Cajitas")).toBeOnTheScreen();
    expect(screen.getByText("Media docena")).toBeOnTheScreen();
    expect(screen.getByText("6 huevos")).toBeOnTheScreen();
    expect(screen.getByText("180 huevos · Formato de carga")).toBeOnTheScreen();
    expect(screen.getAllByText("Inactivo")).toHaveLength(2);
  });

  test("spec 009, RF-26, RF-27: each type and format card is one button Opciones de <nombre>, with its texts and the ⋮", async () => {
    await render(<CatalogSetup />);
    expect(screen.getAllByRole("button", { name: /^Opciones de / })).toHaveLength(TYPES.length + FORMATS.length);
    const type = screen.getByRole("button", { name: "Opciones de Medianos" });
    expect(within(type).getByText("Medianos")).toBeOnTheScreen();
    expect(within(type).getByTestId("icon:more-vert", { includeHiddenElements: true })).toBeOnTheScreen();
    const format = screen.getByRole("button", { name: "Opciones de Pack" });
    expect(within(format).getByText("180 huevos · Formato de carga")).toBeOnTheScreen();
    expect(format).toHaveProp("accessibilityValue", { text: "180 huevos · Formato de carga" });
  });

  test("on Android, where Cancelar does not fit, the menus close by tapping outside or going back", async () => {
    await render(<CatalogSetup />);
    await fireEvent.press(screen.getByRole("button", { name: "Opciones de Medianos" }));
    expect(alert.mock.calls[alert.mock.calls.length - 1][3]).toEqual({ cancelable: true });
    await fireEvent.press(screen.getByRole("button", { name: "Opciones de Pack" }));
    expect(alert.mock.calls[alert.mock.calls.length - 1][3]).toEqual({ cancelable: true });
  });

  test("RF-2, RF-6: the add buttons open the empty forms", async () => {
    await render(<CatalogSetup />);
    await fireEvent.press(screen.getByRole("button", { name: "Agregar tipo" }));
    expect(mockPush).toHaveBeenLastCalledWith("/admin/type-form");
    await fireEvent.press(screen.getByRole("button", { name: "Agregar formato" }));
    expect(mockPush).toHaveBeenLastCalledWith("/admin/format-form");
  });

  test("RF-4: Editar opens the form of that type", async () => {
    await render(<CatalogSetup />);
    await fireEvent.press(screen.getByRole("button", { name: "Opciones de Medianos" }));
    await chooseInAlert("Editar");
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: "/admin/type-form", params: { id: "1" } });
  });

  test("RF-5: an active type is deactivated from its menu", async () => {
    await render(<CatalogSetup />);
    await fireEvent.press(screen.getByRole("button", { name: "Opciones de Medianos" }));
    await chooseInAlert("Desactivar");
    expect(mockSaveType).toHaveBeenCalledWith({ id: 1, name: "Medianos", active: false });
  });

  test("RF-5: an inactive type offers Activar, not Reactivar", async () => {
    await render(<CatalogSetup />);
    await fireEvent.press(screen.getByRole("button", { name: "Opciones de Cajitas" }));
    await chooseInAlert("Activar");
    expect(mockSaveType).toHaveBeenCalledWith({ id: 2, name: "Cajitas", active: true });
  });

  test("RF-8, RF-9: a format is edited and activated from its menu", async () => {
    await render(<CatalogSetup />);
    await fireEvent.press(screen.getByRole("button", { name: "Opciones de Maple" }));
    await chooseInAlert("Activar");
    expect(mockSaveFormat).toHaveBeenCalledWith({ id: 1, name: "Maple", eggs: 30, active: true });
    await fireEvent.press(screen.getByRole("button", { name: "Opciones de Media docena" }));
    await chooseInAlert("Editar");
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: "/admin/format-form", params: { id: "3" } });
  });

  test("RF-10: the load format is not deactivated, and the admin is told why", async () => {
    await render(<CatalogSetup />);
    await fireEvent.press(screen.getByRole("button", { name: "Opciones de Pack" }));
    await chooseInAlert("Desactivar");
    expect(mockSaveFormat).not.toHaveBeenCalled();
    expect(alert).toHaveBeenLastCalledWith(
      "No se puede desactivar",
      "El formato de carga no se puede desactivar: se usa para cargar stock",
    );
  });

  test("a change the base rejects is explained", async () => {
    mockSaveType.mockRejectedValueOnce({ code: "", message: "TypeError: Network request failed" });
    await render(<CatalogSetup />);
    await fireEvent.press(screen.getByRole("button", { name: "Opciones de Medianos" }));
    await chooseInAlert("Desactivar");
    expect(alert).toHaveBeenLastCalledWith("No se pudo guardar", "No hay conexión. Revisá tu internet e intentá de nuevo");
  });

  test("while loading, and when a list fails, with retry", async () => {
    mockQueries.types = { isPending: true, isError: false, refetch: jest.fn() };
    const view = await render(<CatalogSetup />);
    expect(screen.getByLabelText("Cargando")).toBeOnTheScreen();

    const refetch = jest.fn();
    mockQueries.types = { isPending: false, isError: true, refetch };
    await view.rerender(<CatalogSetup />);
    await fireEvent.press(screen.getByRole("button", { name: "Reintentar" }));
    expect(refetch).toHaveBeenCalled();
  });

  // Cambio del RF-34 (2026-11-18): "Eliminar" archives a type or a format, after asking (RF-44 to RF-49).
  test("RF-44, RF-45: a type is deleted after asking; Eliminar is destructive", async () => {
    await render(<CatalogSetup />);
    await fireEvent.press(screen.getByRole("button", { name: "Opciones de Cajitas" }));
    const options = (alert.mock.lastCall?.[2] ?? []) as AlertButton[];
    expect(options.map((option) => option.text)).toEqual(["Editar", "Activar", "Eliminar", "Cancelar"]);
    expect(options.find((option) => option.text === "Eliminar")?.style).toBe("destructive");
    await chooseInAlert("Eliminar");
    expect(alert).toHaveBeenLastCalledWith("¿Eliminar Cajitas?", "No se puede deshacer.", expect.any(Array));
    await chooseInAlert("Eliminar");
    expect(mockArchiveType).toHaveBeenCalledWith(2);
  });

  test("RF-46, RF-48: when the base refuses a type, it says why", async () => {
    mockArchiveType.mockRejectedValueOnce({ code: "P0001", message: "stock_left", hint: "360" });
    await render(<CatalogSetup />);
    await fireEvent.press(screen.getByRole("button", { name: "Opciones de Medianos" }));
    await chooseInAlert("Eliminar");
    await chooseInAlert("Eliminar");
    expect(alert).toHaveBeenLastCalledWith("No se pudo eliminar", "Ajustá el stock a 0 primero (quedan 360 huevos)");
  });

  test("RF-45, RF-46: a format is deleted after asking, and Cancelar keeps it", async () => {
    mockArchiveFormat.mockRejectedValueOnce({ code: "P0001", message: "has_products", hint: "Media docena Super" });
    await render(<CatalogSetup />);
    await fireEvent.press(screen.getByRole("button", { name: "Opciones de Media docena" }));
    await chooseInAlert("Eliminar");
    await chooseInAlert("Cancelar");
    expect(mockArchiveFormat).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole("button", { name: "Opciones de Media docena" }));
    await chooseInAlert("Eliminar");
    await chooseInAlert("Eliminar");
    expect(mockArchiveFormat).toHaveBeenCalledWith(3);
    expect(alert).toHaveBeenLastCalledWith("No se pudo eliminar", "Primero eliminá sus productos: Media docena Super");
  });

  test("RF-49: the load format offers no Eliminar", async () => {
    await render(<CatalogSetup />);
    await fireEvent.press(screen.getByRole("button", { name: "Opciones de Pack" }));
    const options = (alert.mock.lastCall?.[2] ?? []) as AlertButton[];
    expect(options.map((option) => option.text)).toEqual(["Editar", "Desactivar", "Cancelar"]);
  });
});

describe("type form", () => {
  test("RF-2: a new type is saved active and the form closes", async () => {
    await render(<TypeForm />);
    expect(screen.getByRole("header", { name: "Nuevo tipo" })).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText("Nombre"), "  Codorniz ");
    await fireEvent.press(screen.getByRole("button", { name: "Guardar" }));
    expect(mockSaveType).toHaveBeenCalledWith({ name: "Codorniz", active: true });
    expect(mockBack).toHaveBeenCalled();
  });

  test("RF-4: editing keeps the id and the active state", async () => {
    mockParams = { id: "2" };
    await render(<TypeForm />);
    expect(screen.getByRole("header", { name: "Editar tipo" })).toBeOnTheScreen();
    expect(screen.getByLabelText("Nombre")).toHaveDisplayValue("Cajitas");
    await fireEvent.changeText(screen.getByLabelText("Nombre"), "Cajitas x6");
    await fireEvent.press(screen.getByRole("button", { name: "Guardar" }));
    expect(mockSaveType).toHaveBeenCalledWith({ id: 2, name: "Cajitas x6", active: false });
  });

  test("RF-3: an empty name is marked and nothing is sent", async () => {
    await render(<TypeForm />);
    await fireEvent.press(screen.getByRole("button", { name: "Guardar" }));
    expect(screen.getByText("Completá este campo")).toBeOnTheScreen();
    expect(mockSaveType).not.toHaveBeenCalled();
  });

  test("RF-3: a repeated name is explained and the form stays open", async () => {
    mockSaveType.mockRejectedValueOnce({
      code: "23505",
      message: 'duplicate key value violates unique constraint "egg_types_name_key"',
    });
    await render(<TypeForm />);
    await fireEvent.changeText(screen.getByLabelText("Nombre"), "Medianos");
    await fireEvent.press(screen.getByRole("button", { name: "Guardar" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Ya existe un tipo con ese nombre");
    expect(screen.getByLabelText("Nombre")).toHaveDisplayValue("Medianos");
    expect(mockBack).not.toHaveBeenCalled();
  });
});

describe("format form", () => {
  test("RF-6: a new format is saved with its eggs", async () => {
    await render(<FormatForm />);
    expect(screen.getByRole("header", { name: "Nuevo formato" })).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText("Nombre"), "Docena");
    await fireEvent.changeText(screen.getByLabelText("Huevos por unidad"), "12");
    await fireEvent.press(screen.getByRole("button", { name: "Guardar" }));
    expect(mockSaveFormat).toHaveBeenCalledWith({ name: "Docena", eggs: 12, active: true });
    expect(mockBack).toHaveBeenCalled();
  });

  test("RF-8: editing the load format changes its name and eggs", async () => {
    mockParams = { id: "2" };
    await render(<FormatForm />);
    expect(screen.getByLabelText("Huevos por unidad")).toHaveDisplayValue("180");
    await fireEvent.changeText(screen.getByLabelText("Huevos por unidad"), "150");
    await fireEvent.press(screen.getByRole("button", { name: "Guardar" }));
    expect(mockSaveFormat).toHaveBeenCalledWith({ id: 2, name: "Pack", eggs: 150, active: true });
  });

  test("RF-7: eggs out of range are marked", async () => {
    await render(<FormatForm />);
    await fireEvent.changeText(screen.getByLabelText("Nombre"), "Gigante");
    await fireEvent.changeText(screen.getByLabelText("Huevos por unidad"), "1001");
    await fireEvent.press(screen.getByRole("button", { name: "Guardar" }));
    expect(screen.getByText("Ingresá entre 1 y 1.000 huevos")).toBeOnTheScreen();
    expect(mockSaveFormat).not.toHaveBeenCalled();
  });
});

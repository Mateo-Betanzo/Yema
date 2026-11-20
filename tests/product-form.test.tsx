import { fireEvent, render, screen } from "@testing-library/react-native";

import ProductForm from "@/app/admin/product-form";

// Spec 003 · T8: new and edited product (RF-11 to RF-14). The catalog hooks are replaced.
const TYPES = [
  { id: 1, name: "Medianos", active: true, stock: 0 },
  { id: 2, name: "Grandes", active: true, stock: 0 },
];
const FORMATS = [
  { id: 3, name: "Media docena", eggs: 6, active: true, is_load_format: false },
  { id: 2, name: "Pack", eggs: 180, active: true, is_load_format: true },
];
const PRODUCTS = [
  {
    id: 7, egg_type_id: 1, format_id: 2, name: "Pack Mediano", description: "6 maples", price: 10500,
    active: true, type_name: "Medianos", format_name: "Pack", status: "visible", units_available: 2,
  },
  {
    id: 8, egg_type_id: 2, format_id: 2, name: "Pack Grande", description: null, price: 12000,
    active: false, type_name: "Grandes", format_name: "Pack", status: "inactive", units_available: 0,
  },
];

const ok = <T,>(data: T) => ({ data, isPending: false, isError: false, refetch: jest.fn() });
const mockSaveProduct = jest.fn(async (_input: unknown) => undefined);
const mockBack = jest.fn();
let mockParams: { id?: string } = {};

jest.mock("@/lib/catalog", () => ({
  useEggTypes: () => ok(TYPES),
  useFormats: () => ok(FORMATS),
  useProductOverview: () => ok(PRODUCTS),
  useSaveProduct: () => ({ mutateAsync: mockSaveProduct, isPending: false }),
}));
jest.mock("expo-router", () => ({
  router: { back: () => mockBack() },
  useLocalSearchParams: () => mockParams,
}));

/** Presses a chip of the "Tipo" or "Formato" row. */
async function choose(group: string, option: string) {
  expect(screen.getByLabelText(group)).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole("button", { name: option }));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
});

describe("new product", () => {
  test("RF-11: chooses type and format, and saves the product active", async () => {
    await render(<ProductForm />);
    expect(screen.getByRole("header", { name: "Nuevo producto" })).toBeOnTheScreen();
    await choose("Tipo", "Grandes");
    await choose("Formato", "Media docena");
    await fireEvent.changeText(screen.getByLabelText("Nombre"), " Media docena Grande ");
    await fireEvent.changeText(screen.getByLabelText("Descripción (opcional)"), "6 huevos grandes");
    await fireEvent.changeText(screen.getByLabelText("Precio"), "2.400");
    await fireEvent.press(screen.getByRole("button", { name: "Guardar" }));
    expect(mockSaveProduct).toHaveBeenCalledWith({
      egg_type_id: 2,
      format_id: 3,
      name: "Media docena Grande",
      description: "6 huevos grandes",
      price: 2400,
      active: true,
    });
    expect(mockBack).toHaveBeenCalled();
  });

  test("RF-13: every invalid field is marked and nothing is sent", async () => {
    await render(<ProductForm />);
    await fireEvent.changeText(screen.getByLabelText("Precio"), "10,50");
    await fireEvent.press(screen.getByRole("button", { name: "Guardar" }));
    expect(screen.getByText("Elegí un tipo")).toBeOnTheScreen();
    expect(screen.getByText("Elegí un formato")).toBeOnTheScreen();
    expect(screen.getByText("Completá este campo")).toBeOnTheScreen();
    expect(screen.getByText("Ingresá el precio en pesos, sin centavos. Ej.: 10.500")).toBeOnTheScreen();
    expect(mockSaveProduct).not.toHaveBeenCalled();
  });

  test("RF-12: an existing active combination is named, and nothing is created", async () => {
    await render(<ProductForm />);
    await choose("Tipo", "Medianos");
    await choose("Formato", "Pack");
    expect(screen.getByText("Ya existe «Pack Mediano» con ese tipo y formato")).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText("Nombre"), "Otro");
    await fireEvent.changeText(screen.getByLabelText("Precio"), "1");
    await fireEvent.press(screen.getByRole("button", { name: "Guardar" }));
    expect(mockSaveProduct).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Activar" })).toBeNull();
  });

  test("RF-12: an existing inactive combination offers Activar", async () => {
    await render(<ProductForm />);
    await choose("Tipo", "Grandes");
    await choose("Formato", "Pack");
    expect(screen.getByText("Ya existe «Pack Grande» con ese tipo y formato, inactivo")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Activar" }));
    expect(mockSaveProduct).toHaveBeenCalledWith(
      expect.objectContaining({ id: 8, egg_type_id: 2, format_id: 2, name: "Pack Grande", active: true }),
    );
    expect(mockBack).toHaveBeenCalled();
  });

  test("a combination the base rejects is explained and the form stays", async () => {
    mockSaveProduct.mockRejectedValueOnce({
      code: "23505",
      message: 'duplicate key value violates unique constraint "products_type_format_key"',
    });
    await render(<ProductForm />);
    await choose("Tipo", "Grandes");
    await choose("Formato", "Media docena");
    await fireEvent.changeText(screen.getByLabelText("Nombre"), "Media docena Grande");
    await fireEvent.changeText(screen.getByLabelText("Precio"), "2400");
    await fireEvent.press(screen.getByRole("button", { name: "Guardar" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Ya existe un producto con ese tipo y formato");
    expect(mockBack).not.toHaveBeenCalled();
  });
});

describe("edited product", () => {
  test("RF-14: shows its type and format fixed, and saves name, description and price", async () => {
    mockParams = { id: "7" };
    await render(<ProductForm />);
    expect(screen.getByRole("header", { name: "Editar producto" })).toBeOnTheScreen();
    expect(screen.getByText("Medianos · Pack")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Grandes" })).toBeNull();
    expect(screen.getByLabelText("Precio")).toHaveDisplayValue("10.500");
    await fireEvent.changeText(screen.getByLabelText("Precio"), "11.000");
    await fireEvent.press(screen.getByRole("button", { name: "Guardar" }));
    expect(mockSaveProduct).toHaveBeenCalledWith({
      id: 7,
      egg_type_id: 1,
      format_id: 2,
      name: "Pack Mediano",
      description: "6 maples",
      price: 11000,
      active: true,
    });
  });
});

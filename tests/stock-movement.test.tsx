import { fireEvent, render, screen } from "@testing-library/react-native";

import StockMovement from "@/app/admin/stock-movement";

// Spec 003 · T9: load and adjustment of a type (RF-18 to RF-21). The catalog hooks are replaced.
const TYPES = [{ id: 1, name: "Medianos", active: true, stock: 375 }];
const FORMATS = [
  { id: 1, name: "Maple", eggs: 30, active: true, is_load_format: false },
  { id: 2, name: "Pack", eggs: 180, active: true, is_load_format: true },
];

const ok = <T,>(data: T) => ({ data, isPending: false, isError: false, refetch: jest.fn() });
const mockLoad = jest.fn(async (_input: unknown) => 735);
const mockAdjust = jest.fn(async (_input: unknown) => 369);
const mockBack = jest.fn();
let mockParams: { typeId?: string; kind?: string } = {};

jest.mock("@/lib/catalog", () => ({
  useEggTypes: () => ok(TYPES),
  useFormats: () => ok(FORMATS),
  useLoadStock: () => ({ mutateAsync: mockLoad, isPending: false }),
  useAdjustStock: () => ({ mutateAsync: mockAdjust, isPending: false }),
}));
jest.mock("expo-router", () => ({
  router: { back: () => mockBack() },
  useLocalSearchParams: () => mockParams,
}));

beforeEach(() => jest.clearAllMocks());

describe("load", () => {
  beforeEach(() => {
    mockParams = { typeId: "1", kind: "load" };
  });

  test("RF-18: shows the type, its stock and what a pack is worth now", async () => {
    await render(<StockMovement />);
    expect(screen.getByRole("header", { name: "Cargar Medianos" })).toBeOnTheScreen();
    expect(screen.getByText("Hay 12 maples y 15 huevos")).toBeOnTheScreen();
    expect(screen.getByText("Cada Pack suma 180 huevos")).toBeOnTheScreen();
  });

  test("RF-18: loads the packs with the optional note, and closes", async () => {
    await render(<StockMovement />);
    await fireEvent.changeText(screen.getByLabelText("Packs"), "2");
    await fireEvent.changeText(screen.getByLabelText("Nota (opcional)"), " Proveedor X ");
    await fireEvent.press(screen.getByRole("button", { name: "Cargar" }));
    expect(mockLoad).toHaveBeenCalledWith({ eggTypeId: 1, packs: 2, note: "Proveedor X" });
    expect(mockBack).toHaveBeenCalled();
  });

  test("RF-18: packs out of range are marked and nothing is sent", async () => {
    await render(<StockMovement />);
    await fireEvent.changeText(screen.getByLabelText("Packs"), "101");
    await fireEvent.press(screen.getByRole("button", { name: "Cargar" }));
    expect(screen.getByText("Ingresá entre 1 y 100 packs")).toBeOnTheScreen();
    expect(mockLoad).not.toHaveBeenCalled();
  });

  test("without connection, says so and keeps what was typed", async () => {
    mockLoad.mockRejectedValueOnce({ code: "", message: "TypeError: Network request failed" });
    await render(<StockMovement />);
    await fireEvent.changeText(screen.getByLabelText("Packs"), "2");
    await fireEvent.press(screen.getByRole("button", { name: "Cargar" }));
    expect(screen.getByRole("alert")).toHaveTextContent("No hay conexión. Revisá tu internet e intentá de nuevo");
    expect(screen.getByLabelText("Packs")).toHaveDisplayValue("2");
    expect(mockBack).not.toHaveBeenCalled();
  });
});

describe("adjustment", () => {
  beforeEach(() => {
    mockParams = { typeId: "1", kind: "adjustment" };
  });

  test("RF-19: subtracts the eggs with a reason, and closes", async () => {
    await render(<StockMovement />);
    expect(screen.getByRole("header", { name: "Ajustar Medianos" })).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText("Huevos a restar"), "6");
    await fireEvent.changeText(screen.getByLabelText("Motivo"), "Rotura");
    await fireEvent.press(screen.getByRole("button", { name: "Ajustar" }));
    expect(mockAdjust).toHaveBeenCalledWith({ eggTypeId: 1, eggs: 6, reason: "Rotura" });
    expect(mockBack).toHaveBeenCalled();
  });

  test("RF-20, RF-21: more than the stock, or no reason, is marked before sending", async () => {
    await render(<StockMovement />);
    await fireEvent.changeText(screen.getByLabelText("Huevos a restar"), "376");
    await fireEvent.press(screen.getByRole("button", { name: "Ajustar" }));
    expect(screen.getByText("No alcanza: hay 375 huevos")).toBeOnTheScreen();
    expect(screen.getByText("Completá este campo")).toBeOnTheScreen();
    expect(mockAdjust).not.toHaveBeenCalled();
  });

  test("RF-20: if the stock changed meanwhile, the base's answer says how much there is", async () => {
    mockAdjust.mockRejectedValueOnce({ code: "P0001", message: "insufficient_stock", hint: "4" });
    await render(<StockMovement />);
    await fireEvent.changeText(screen.getByLabelText("Huevos a restar"), "6");
    await fireEvent.changeText(screen.getByLabelText("Motivo"), "Rotura");
    await fireEvent.press(screen.getByRole("button", { name: "Ajustar" }));
    expect(screen.getByRole("alert")).toHaveTextContent("No alcanza: hay 4 huevos");
  });
});

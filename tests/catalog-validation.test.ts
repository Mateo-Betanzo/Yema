import {
  findSameCombination,
  parsePrice,
  validateAdjustment,
  validateFormatForm,
  validateLoad,
  validateProductForm,
  validateTypeForm,
} from "@/logic/catalog-validation";
import { parseWholeNumber } from "@/logic/form-rules";

// Spec 003 · T5: the catalog and stock forms (RF-3, RF-7, RF-12, RF-13, RF-18, RF-19, RF-21). The
// base repeats every rule; these show each mistake under its field before sending.
const REQUIRED = "Completá este campo";

describe("parseWholeNumber", () => {
  test.each([
    ["12", 12],
    [" 180 ", 180],
    ["0", 0],
    ["007", 7],
  ])("%j → %d", (text, expected) => {
    expect(parseWholeNumber(text)).toBe(expected);
  });

  test.each(["", "  ", "1.5", "1,5", "-3", "+3", "12a", "1 2", "1e3"])("%j is not a whole number", (text) => {
    expect(parseWholeNumber(text)).toBeNull();
  });
});

describe("validateTypeForm (RF-3)", () => {
  test("returns the name trimmed", () => {
    expect(validateTypeForm({ name: "  Codorniz " })).toEqual({ ok: true, data: { name: "Codorniz" } });
  });

  test.each([
    ["", REQUIRED],
    ["   ", REQUIRED],
    ["a".repeat(31), "Usá hasta 30 caracteres"],
  ])("rejects %j", (name, message) => {
    expect(validateTypeForm({ name })).toEqual({ ok: false, errors: { name: message } });
  });

  test("accepts 30 characters, counted like the base (an emoji is one)", () => {
    expect(validateTypeForm({ name: "😀".repeat(30) }).ok).toBe(true);
  });
});

describe("validateFormatForm (RF-7)", () => {
  test("returns the name trimmed and the eggs as a number", () => {
    expect(validateFormatForm({ name: " Docena ", eggs: "12" })).toEqual({
      ok: true,
      data: { name: "Docena", eggs: 12 },
    });
  });

  test.each(["1", "1000"])("accepts %s eggs", (eggs) => {
    expect(validateFormatForm({ name: "Docena", eggs }).ok).toBe(true);
  });

  test.each([
    ["", REQUIRED],
    ["0", "Ingresá entre 1 y 1.000 huevos"],
    ["1001", "Ingresá entre 1 y 1.000 huevos"],
    ["12.5", "Ingresá entre 1 y 1.000 huevos"],
    ["doce", "Ingresá entre 1 y 1.000 huevos"],
  ])("rejects %j eggs", (eggs, message) => {
    expect(validateFormatForm({ name: "Docena", eggs })).toEqual({ ok: false, errors: { eggs: message } });
  });

  test("reports name and eggs at once", () => {
    expect(validateFormatForm({ name: "", eggs: "0" })).toEqual({
      ok: false,
      errors: { name: REQUIRED, eggs: "Ingresá entre 1 y 1.000 huevos" },
    });
  });
});

describe("parsePrice (RF-13)", () => {
  test.each([
    ["10500", 10500],
    ["10.500", 10500],
    [" 1.000.000 ", 1000000],
    ["0", 0],
    ["999", 999],
  ])("%j → %d", (text, expected) => {
    expect(parsePrice(text)).toBe(expected);
  });

  test.each(["", "10,50", "10.50", "1.0000", ".500", "10.", "-500", "$10.500", "diez"])("%j is not a price", (text) => {
    expect(parsePrice(text)).toBeNull();
  });
});

describe("validateProductForm (RF-13)", () => {
  const valid = { typeId: 1, formatId: 2, name: " Pack Mediano ", description: " 6 maples ", price: "10.500" };

  test("returns the data ready to save", () => {
    expect(validateProductForm(valid)).toEqual({
      ok: true,
      data: { egg_type_id: 1, format_id: 2, name: "Pack Mediano", description: "6 maples", price: 10500 },
    });
  });

  test("an empty description becomes null", () => {
    const result = validateProductForm({ ...valid, description: "   " });
    expect(result.ok && result.data.description).toBeNull();
  });

  test("the limits are accepted: name of 50, description of 120, $1 and $10.000.000", () => {
    for (const price of ["1", "10.000.000"]) {
      expect(validateProductForm({ ...valid, name: "n".repeat(50), description: "d".repeat(120), price }).ok).toBe(true);
    }
  });

  test("marks every invalid field at once", () => {
    expect(
      validateProductForm({ typeId: null, formatId: null, name: "  ", description: "d".repeat(121), price: "" }),
    ).toEqual({
      ok: false,
      errors: {
        typeId: "Elegí un tipo",
        formatId: "Elegí un formato",
        name: REQUIRED,
        description: "Usá hasta 120 caracteres",
        price: REQUIRED,
      },
    });
  });

  test.each([
    ["0", "El precio va de $1 a $10.000.000"],
    ["10.000.001", "El precio va de $1 a $10.000.000"],
    ["10,50", "Ingresá el precio en pesos, sin centavos. Ej.: 10.500"],
  ])("the price %j is rejected", (price, message) => {
    expect(validateProductForm({ ...valid, price })).toEqual({ ok: false, errors: { price: message } });
  });

  test("a name of 51 characters is rejected", () => {
    expect(validateProductForm({ ...valid, name: "n".repeat(51) })).toEqual({
      ok: false,
      errors: { name: "Usá hasta 50 caracteres" },
    });
  });
});

describe("findSameCombination (RF-12)", () => {
  const products = [
    { id: 1, egg_type_id: 1, format_id: 2, name: "Pack Mediano", active: false },
    { id: 2, egg_type_id: 2, format_id: 2, name: "Pack Grande", active: true },
  ];

  test("finds the product with that type and format, even if inactive", () => {
    expect(findSameCombination(products, 1, 2)).toBe(products[0]);
  });

  test("nothing when the combination is free or incomplete", () => {
    expect(findSameCombination(products, 1, 3)).toBeUndefined();
    expect(findSameCombination(products, null, 2)).toBeUndefined();
  });
});

describe("validateLoad (RF-18, RF-21)", () => {
  test("returns the packs and the note trimmed, or null", () => {
    expect(validateLoad({ packs: "2", note: " Proveedor X " })).toEqual({
      ok: true,
      data: { packs: 2, note: "Proveedor X" },
    });
    expect(validateLoad({ packs: "100", note: "  " })).toEqual({ ok: true, data: { packs: 100, note: null } });
  });

  test.each([
    ["", REQUIRED],
    ["0", "Ingresá entre 1 y 100 packs"],
    ["101", "Ingresá entre 1 y 100 packs"],
    ["1.5", "Ingresá entre 1 y 100 packs"],
  ])("rejects %j packs", (packs, message) => {
    expect(validateLoad({ packs, note: "" })).toEqual({ ok: false, errors: { packs: message } });
  });

  test("rejects a note of 121 characters", () => {
    expect(validateLoad({ packs: "1", note: "n".repeat(121) })).toEqual({
      ok: false,
      errors: { note: "Usá hasta 120 caracteres" },
    });
  });
});

describe("validateAdjustment (RF-19, RF-20, RF-21)", () => {
  test("returns the eggs and the reason trimmed", () => {
    expect(validateAdjustment({ eggs: "6", reason: " Rotura " }, 375)).toEqual({
      ok: true,
      data: { eggs: 6, reason: "Rotura" },
    });
  });

  test("the whole stock can be adjusted down to 0", () => {
    expect(validateAdjustment({ eggs: "375", reason: "Conteo" }, 375).ok).toBe(true);
  });

  test.each([
    ["", REQUIRED],
    ["0", "Ingresá una cantidad de huevos mayor que 0"],
    ["-6", "Ingresá una cantidad de huevos mayor que 0"],
    ["2.5", "Ingresá una cantidad de huevos mayor que 0"],
  ])("rejects %j eggs", (eggs, message) => {
    expect(validateAdjustment({ eggs, reason: "Rotura" }, 375)).toEqual({ ok: false, errors: { eggs: message } });
  });

  test.each([
    [376, 375, "No alcanza: hay 375 huevos"],
    [2, 1, "No alcanza: hay 1 huevo"],
    [1, 0, "No alcanza: hay 0 huevos"],
    [1001, 1000, "No alcanza: hay 1.000 huevos"],
  ])("RF-20: %d eggs with a stock of %d says how many there are", (eggs, stock, message) => {
    expect(validateAdjustment({ eggs: String(eggs), reason: "Conteo" }, stock)).toEqual({
      ok: false,
      errors: { eggs: message },
    });
  });

  test.each([
    ["", REQUIRED],
    ["   ", REQUIRED],
    ["r".repeat(121), "Usá hasta 120 caracteres"],
  ])("RF-21: rejects the reason %j", (reason, message) => {
    expect(validateAdjustment({ eggs: "6", reason }, 375)).toEqual({ ok: false, errors: { reason: message } });
  });
});

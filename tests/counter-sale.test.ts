import {
  COUNTER_SALE_MAX,
  COUNTER_SALE_NAME_MAX,
  counterSaleErrorMessage,
  counterSaleLabel,
  saleSuccessText,
} from "@/logic/counter-sale";

// Spec 008 · T3: what the counter sale says (RF-4, RF-6, RF-11, RF-13). The base decides; these only
// write what it answered.
const postgres = (message: string, hint: string | null = null) => ({ code: "P0001", message, details: null, hint });

describe("counter sale limits", () => {
  test("RF-3, RF-6: up to 99 units per product and a name of up to 60 characters", () => {
    expect(COUNTER_SALE_MAX).toBe(99);
    expect(COUNTER_SALE_NAME_MAX).toBe(60);
  });
});

describe("counterSaleErrorMessage (RF-11)", () => {
  test.each([
    [postgres("product_unavailable", "Maple Grandes"), "Maple Grandes ya no está a la venta"],
    [postgres("not_enough_units", "Maple Grandes"), "No alcanzan las unidades de Maple Grandes"],
    [postgres("price_changed"), "Cambiaron los precios, revisá la venta"],
    [{ code: "", message: "TypeError: Network request failed", details: null, hint: null }, "No pudimos registrar la venta. Revisá tu conexión."],
    [postgres("invalid_items"), "No pudimos registrar la venta"],
    [new Error("boom"), "No pudimos registrar la venta"],
  ])("%o → %s", (error, text) => {
    expect(counterSaleErrorMessage(error)).toBe(text);
  });
});

describe("saleSuccessText (RF-13)", () => {
  test("the number and the total of the sale", () => {
    expect(saleSuccessText({ order_id: 212, total: 10500 })).toBe("Venta registrada · #212 · $10.500");
  });
});

describe("counterSaleLabel (RF-15)", () => {
  test("Venta en el local, with the name when there is one", () => {
    expect(counterSaleLabel("Juan Gómez")).toBe("Venta en el local · Juan Gómez");
    expect(counterSaleLabel(null)).toBe("Venta en el local");
  });
});

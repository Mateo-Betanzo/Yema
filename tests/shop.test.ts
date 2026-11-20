import { groupByFormat } from "@/logic/shop";

// Spec 003 · T10: the Shop sections (RF-26, RF-27). shop_products() already sorts by format eggs and
// name: grouping keeps that order.
const item = (id: number, format_id: number, format_name: string) => ({ id, format_id, format_name });

describe("groupByFormat", () => {
  test("one section per format, in the order the products come", () => {
    const products = [item(1, 3, "Media docena"), item(2, 1, "Maple"), item(3, 1, "Maple"), item(4, 2, "Pack")];
    expect(groupByFormat(products)).toEqual([
      { formatId: 3, formatName: "Media docena", products: [products[0]] },
      { formatId: 1, formatName: "Maple", products: [products[1], products[2]] },
      { formatId: 2, formatName: "Pack", products: [products[3]] },
    ]);
  });

  test("no products, no sections", () => {
    expect(groupByFormat([])).toEqual([]);
  });
});

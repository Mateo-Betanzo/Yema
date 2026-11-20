// The Shop sections (spec 003: RF-26, RF-27). shop_products() already sorts by format eggs and name:
// grouping keeps that order, so the sections and the filters follow it too.

export type ShopSection<P> = { formatId: number; formatName: string; products: P[] };

export function groupByFormat<P extends { format_id: number; format_name: string }>(products: readonly P[]): ShopSection<P>[] {
  const sections: ShopSection<P>[] = [];
  for (const product of products) {
    let section = sections.find((current) => current.formatId === product.format_id);
    if (!section) {
      section = { formatId: product.format_id, formatName: product.format_name, products: [] };
      sections.push(section);
    }
    section.products.push(product);
  }
  return sections;
}

import { router } from "expo-router";
import { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";

import { FilterChips } from "@/components/filter-chips";
import { ListState } from "@/components/list-state";
import { Notice } from "@/components/notice";
import { ProductCard } from "@/components/product-card";
import { useCart } from "@/lib/cart";
import { useShopProducts, type ShopProduct } from "@/lib/catalog";
import { useActiveOrder } from "@/lib/orders";
import { addErrorMessage } from "@/logic/cart";
import { formatARS } from "@/logic/currency";
import { groupByFormat } from "@/logic/shop";
import { formatRemaining } from "@/logic/stock";
import { theme } from "@/theme";

// The list of the Shop, as Shop in the Figma, from shop_products(). Spec 003 (RF-26 to RF-31): format
// filters and the products grouped by format; touching one opens its screen (RF-29, a modal until the
// cambio del 2026-11-18). Spec 004: the units left of each product (RF-5), "Agregar" on the card, which
// adds to the cart (RF-8 to RF-12), and the notice of an active order (RF-36). Spec 010 (RF-2) shows it
// in the client Home; the screen decides when to refresh it. /feature 2026-11-18: each format is a grid
// of two columns of cards with "Agregar" (the "+" is gone; the description only in the product screen),
// and "Tu más comprado" (mostBought, from the orders the Home has), violet and white, goes at the whole
// width right above the section of its format, only with "Todos", and again inside the section. Without
// a product bought before, there is none.
export function ShopCatalog({ featured = null }: { featured?: ShopProduct | null }) {
  const products = useShopProducts();
  const activeOrder = useActiveOrder();
  const cart = useCart();
  const [formatId, setFormatId] = useState<number | null>(null);

  // While the active order loads, buying stays possible: create_order checks it again (spec 004, RF-27).
  const canBuy = !activeOrder.data;

  const sections = groupByFormat(products.data ?? []);
  const shown = formatId === null ? sections : sections.filter((section) => section.formatId === formatId);
  const filters = [
    { value: null, label: "Todos" },
    ...sections.map((section) => ({ value: section.formatId, label: section.formatName })),
  ];

  function add(product: ShopProduct) {
    const error = cart.add(product);
    if (error) Alert.alert(addErrorMessage(error));
  }

  function card(product: ShopProduct, wide = false) {
    return (
      <ProductCard
        key={product.id}
        title={product.name}
        price={formatARS(product.price)}
        remaining={formatRemaining(product.units_available)}
        buyDisabled={!product.available || !canBuy}
        wide={wide}
        onOpen={() => router.push({ pathname: "/client/product/[id]", params: { id: String(product.id) } })}
        onBuy={() => add(product)}
      />
    );
  }

  return (
    <>
      {!canBuy && <Notice message="Ya tenés un pedido en curso" />}
      <ListState
        loading={products.isPending}
        error={products.isError ? "No pudimos cargar la Tienda" : null}
        empty={products.data?.length === 0 ? "Todavía no hay productos en la Tienda" : null}
        onRetry={() => products.refetch()}
      >
        <FilterChips label="Formato" options={filters} value={formatId} onChange={setFormatId} />
        {shown.map((section) => (
          <View key={section.formatId} style={styles.section}>
            {formatId === null && featured?.format_id === section.formatId && (
              <View style={styles.featured}>
                <Text style={styles.sectionTitle} accessibilityRole="header">
                  Tu más comprado
                </Text>
                {card(featured, true)}
              </View>
            )}
            <Text style={styles.sectionTitle} accessibilityRole="header">
              {section.formatName}
            </Text>
            {pairs(section.products).map((row) => (
              <View key={row[0].id} testID="shop-row" style={styles.row}>
                {row.map((product) => card(product))}
                {row.length === 1 && <View testID="shop-row-spacer" style={styles.spacer} />}
              </View>
            ))}
          </View>
        ))}
      </ListState>
    </>
  );
}

/** The products of a format two by two, for the rows of the grid; an odd one is left alone. */
function pairs<T>(items: readonly T[]): T[][] {
  const rows: T[][] = [];
  for (let index = 0; index < items.length; index += 2) rows.push(items.slice(index, index + 2));
  return rows;
}

const styles = StyleSheet.create({
  section: {
    gap: theme.spacing.md,
  },
  // A little more room before the title of its section than between the cards.
  featured: {
    gap: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  // Two cards per row, the same height; an odd one takes half the row next to an empty space.
  row: {
    flexDirection: "row",
    gap: theme.spacing.md,
  },
  spacer: {
    flex: 1,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.sizes.lg,
    fontWeight: theme.typography.weights.semibold,
  },
});

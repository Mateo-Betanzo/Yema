import { router, usePreventRemove } from "expo-router";
import { useRef, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";

import { CART_BAR_SPACE, CartBar } from "@/components/cart-bar";
import { FilterChips } from "@/components/filter-chips";
import { ListState } from "@/components/list-state";
import { PageScreen } from "@/components/page-screen";
import { ProductRow } from "@/components/product-row";
import { RoundButton } from "@/components/round-button";
import { TextField } from "@/components/text-field";
import { useCreateCounterSale } from "@/lib/admin-orders";
import { useShopProducts, type ShopProduct } from "@/lib/catalog";
import { addErrorMessage, addUnit, cartLines, cartSummary, orderItems, removeUnit, type Cart } from "@/logic/cart";
import { COUNTER_SALE_MAX, COUNTER_SALE_NAME_MAX, counterSaleErrorMessage, saleSuccessText } from "@/logic/counter-sale";
import { formatARS } from "@/logic/currency";
import { groupByFormat } from "@/logic/shop";
import { formatRemaining } from "@/logic/stock";
import { theme } from "@/theme";

// The counter sale of the admin (spec 008: RF-2 to RF-7, RF-9 to RF-13), with the pieces of the Shop and
// the cart (brief of T4): the format filters, the rows of the Shop with "+" (and "− N +" once a product
// is in the sale), an optional name at the end and, at the bottom, the cart bar with "Confirmar venta".
// The sale is the cart of spec 004 with a limit of 99 and lives here, in memory, while the screen is open.
// The base decides what is available, the prices and the total (create_counter_sale); confirmation,
// errors and success are system alerts, so they show wherever the list is scrolled. Leaving with a sale
// built asks first (RF-8), with usePreventRemove of expo-router: it holds the back button, the gesture
// and the header's "atrás" alike.
export default function CounterSale() {
  const products = useShopProducts();
  const create = useCreateCounterSale();
  const [formatId, setFormatId] = useState<number | null>(null);
  const [sale, setSale] = useState<Cart>([]);
  const [name, setName] = useState("");
  const [barSpace, setBarSpace] = useState(CART_BAR_SPACE);
  // One sale per confirmation: isPending only updates on the next render (RF-12).
  const sending = useRef(false);

  const sections = groupByFormat(products.data ?? []);
  const shown = formatId === null ? sections : sections.filter((section) => section.formatId === formatId);
  const filters = [
    { value: null, label: "Todos" },
    ...sections.map((section) => ({ value: section.formatId, label: section.formatName })),
  ];
  // RF-11 (T8): a product that left the Shop after a refresh has no row to take it out with, so the sale
  // counts and sends only the products still in the Shop (the alert already said which one left).
  const inShop = new Set((products.data ?? []).map((product) => product.id));
  const forSale = products.data ? sale.filter((item) => inShop.has(item.productId)) : sale;
  const summary = cartSummary(cartLines(forSale, products.data ?? undefined));

  // RF-8: with products in the sale, leaving asks; "Descartar" lets the blocked way out go on.
  const disablePrevention = usePreventRemove(forSale.length > 0, ({ repeat }) => {
    Alert.alert("¿Descartar la venta?", undefined, [
      { text: "Seguir vendiendo", style: "cancel" },
      {
        text: "Descartar",
        style: "destructive",
        onPress: () => {
          setSale([]);
          repeat();
        },
      },
    ]);
  });

  function add(product: ShopProduct) {
    const result = addUnit(sale, product, COUNTER_SALE_MAX);
    if (result.error) Alert.alert(addErrorMessage(result.error, COUNTER_SALE_MAX));
    else setSale(result.cart);
  }

  async function register() {
    if (sending.current) return;
    sending.current = true;
    try {
      const registered = await create.mutateAsync({
        items: orderItems(forSale),
        expectedTotal: summary.total,
        customerName: name,
      });
      // RF-13: registered, nothing is left to discard: close without asking.
      disablePrevention();
      router.back();
      Alert.alert(saleSuccessText(registered));
    } catch (error) {
      // RF-11: nothing was registered; the sale and the name stay, and the list refreshes by itself.
      Alert.alert(counterSaleErrorMessage(error));
    } finally {
      sending.current = false;
    }
  }

  function confirm() {
    Alert.alert(`¿Registrar la venta por ${formatARS(summary.total)}?`, undefined, [
      { text: "No, volver", style: "cancel" },
      { text: "Sí, registrar", onPress: () => void register() },
    ]);
  }

  return (
    <PageScreen
      title="Nueva venta"
      footerSpace={barSpace}
      footer={
        <CartBar
          total={summary.total}
          units={summary.units}
          label="Confirmar venta"
          disabled={summary.units === 0}
          busy={create.isPending}
          overTabBar={false}
          onHeight={setBarSpace}
          onPress={confirm}
        />
      }
    >
      <ListState
        loading={products.isPending}
        error={products.isError ? "No pudimos cargar los productos" : null}
        empty={products.data?.length === 0 ? "No hay productos para vender" : null}
        onRetry={() => products.refetch()}
      >
        <FilterChips label="Formato" options={filters} value={formatId} onChange={setFormatId} />
        {shown.map((section) => (
          <View key={section.formatId} style={styles.section}>
            <Text style={styles.sectionTitle} accessibilityRole="header">
              {section.formatName}
            </Text>
            {section.products.map((product) => (
              <ProductRow
                key={product.id}
                title={product.name}
                lines={[formatARS(product.price), formatRemaining(product.available ? product.units_available : 0)]}
                dimmed={!product.available}
                trailing={
                  <Quantity
                    product={product}
                    quantity={sale.find((item) => item.productId === product.id)?.quantity ?? 0}
                    onAdd={() => add(product)}
                    onRemove={() => setSale(removeUnit(sale, product.id))}
                  />
                }
              />
            ))}
          </View>
        ))}
        <TextField
          label="Nombre del cliente (opcional)"
          placeholder="Nombre del cliente (opcional)"
          value={name}
          onChangeText={setName}
          maxLength={COUNTER_SALE_NAME_MAX}
          autoCapitalize="words"
          returnKeyType="done"
        />
      </ListState>
    </PageScreen>
  );
}

type QuantityProps = { product: ShopProduct; quantity: number; onAdd: () => void; onRemove: () => void };

// RF-3, RF-5: with no units in the sale, only the "+" (disabled without stock, saying why); with some,
// "−", the quantity and "+", as the cart. 48 pt each, outside the row's button.
function Quantity({ product, quantity, onAdd, onRemove }: QuantityProps) {
  if (quantity === 0) {
    return (
      <RoundButton
        icon="plus"
        label={product.available ? `Agregar una unidad de ${product.name}` : "No disponible: sin stock"}
        disabled={!product.available}
        onPress={onAdd}
      />
    );
  }
  return (
    <View style={styles.quantity}>
      <RoundButton icon="minus" label={`Quitar una unidad de ${product.name}`} onPress={onRemove} />
      <Text
        style={styles.count}
        accessibilityLabel={`${quantity} ${quantity === 1 ? "unidad" : "unidades"} de ${product.name}`}
      >
        {quantity}
      </Text>
      <RoundButton icon="plus" label={`Agregar una unidad de ${product.name}`} onPress={onAdd} />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: theme.spacing.md,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.sizes.lg,
    fontWeight: theme.typography.weights.semibold,
  },
  quantity: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  // Figures of one width: going from 9 to 10 does not push the "+" (T8, emil-design-eng).
  count: {
    minWidth: 24,
    fontVariant: ["tabular-nums"],
    color: theme.colors.text,
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.semibold,
    textAlign: "center",
  },
});

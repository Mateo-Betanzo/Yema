import Feather from "@expo/vector-icons/Feather";
import { router } from "expo-router";
import { Alert, StyleSheet, Text, View } from "react-native";

import { ListState } from "@/components/list-state";
import { PageScreen } from "@/components/page-screen";
import { PrimaryButton } from "@/components/primary-button";
import { RoundButton } from "@/components/round-button";
import { useCart } from "@/lib/cart";
import { useShopProducts } from "@/lib/catalog";
import { useActiveOrder } from "@/lib/orders";
import { useRefreshOnFocus } from "@/lib/use-refresh-on-focus";
import { addErrorMessage, cartLines, cartSummary, lineIssueText, type CartLine } from "@/logic/cart";
import { formatARS } from "@/logic/currency";
import { theme } from "@/theme";

// The cart (spec 004: RF-14 to RF-18), a tab since spec 010 (RF-11 to RF-13), opened from the tab bar
// or the cart button of the Home. Each line with its price per unit, quantity and subtotal from the last
// Shop update (RF-17); a line whose product left the Shop or has fewer units left than its quantity is
// marked and holds "Continuar" until the client fixes it (RF-18). Coming back to the tab refreshes the
// prices and the active order, which empties the cart (RF-34, in the tabs layout). No Figma: a card per
// line, without the egg image, so the name fits next to "− N +" at 375 pt.
export default function CartScreen() {
  const products = useShopProducts();
  const activeOrder = useActiveOrder();
  const cart = useCart();

  useRefreshOnFocus(products.refetch);
  useRefreshOnFocus(activeOrder.refetch);

  const shop = products.data ?? undefined;
  const lines = cartLines(cart.items, shop);
  const summary = cartSummary(lines);

  function add(productId: number) {
    const product = shop?.find((candidate) => candidate.id === productId);
    if (!product) return;
    const error = cart.add(product);
    if (error) Alert.alert(addErrorMessage(error));
  }

  if (cart.items.length === 0) {
    return (
      <PageScreen title="Carrito" back={false} tabRoot>
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Tu carrito está vacío</Text>
          <PrimaryButton title="Ver productos" variant="outline" onPress={() => router.navigate("/client")} />
        </View>
      </PageScreen>
    );
  }

  return (
    <PageScreen title="Carrito" back={false} tabRoot>
      <ListState
        loading={products.isPending}
        error={products.isError ? "No pudimos cargar los precios del carrito" : null}
        empty={null}
        onRetry={() => products.refetch()}
      >
        {lines.map((line) => (
          <CartLineCard
            key={line.productId}
            line={line}
            onAdd={() => add(line.productId)}
            onRemove={() => cart.remove(line.productId)}
          />
        ))}
        <View style={styles.footer}>
          {!summary.canContinue && <Text style={styles.blocked}>Corregí los productos marcados para continuar</Text>}
          <View style={styles.totalRow} accessible accessibilityLabel={`Total ${formatARS(summary.total)}`}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.total}>{formatARS(summary.total)}</Text>
          </View>
          <PrimaryButton
            title="Continuar"
            disabled={!summary.canContinue}
            onPress={() => router.push("/client/checkout")}
          />
        </View>
      </ListState>
    </PageScreen>
  );
}

function CartLineCard({ line, onAdd, onRemove }: { line: CartLine; onAdd: () => void; onRemove: () => void }) {
  const issue = lineIssueText(line);
  const forSale = line.price !== null;
  return (
    <View testID={`cart-line-${line.name}`} style={[styles.card, issue !== null && styles.cardMarked]}>
      <View style={styles.top}>
        <Text style={styles.name}>{line.name}</Text>
        {forSale && <Text style={styles.subtotal}>{formatARS(line.subtotal)}</Text>}
      </View>
      {line.price !== null && <Text style={styles.unitPrice}>{formatARS(line.price)} c/u</Text>}
      {issue !== null && (
        <View style={styles.issue} accessible accessibilityLabel={issue}>
          <Feather name="alert-circle" size={16} color={theme.colors.text} />
          <Text style={styles.issueText}>{issue}</Text>
        </View>
      )}
      <View style={styles.stepper}>
        <RoundButton icon="minus" label={`Quitar una unidad de ${line.name}`} onPress={onRemove} />
        <Text style={styles.quantity} accessibilityLabel={`${line.quantity} ${line.quantity === 1 ? "unidad" : "unidades"}`}>
          {line.quantity}
        </Text>
        {forSale && <RoundButton icon="plus" label={`Agregar una unidad de ${line.name}`} onPress={onAdd} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    gap: theme.spacing.xl,
    paddingTop: theme.spacing.xxxl,
  },
  emptyText: {
    color: theme.colors.text,
    fontSize: theme.typography.sizes.lg,
    textAlign: "center",
  },
  card: {
    gap: theme.spacing.xs,
    padding: theme.spacing.lg,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.surface,
    backgroundColor: theme.colors.surface,
  },
  // A marked line gets the primary border, as the errors (with text and icon, not only color).
  cardMarked: {
    borderColor: theme.colors.primary,
  },
  top: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: theme.spacing.md,
  },
  name: {
    flex: 1,
    color: theme.colors.text,
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.semibold,
  },
  subtotal: {
    color: theme.colors.text,
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.semibold,
  },
  unitPrice: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.sizes.sm,
  },
  issue: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
  },
  issueText: {
    color: theme.colors.text,
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.semibold,
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-end",
    gap: theme.spacing.md,
    marginTop: theme.spacing.sm,
  },
  quantity: {
    minWidth: 24,
    color: theme.colors.text,
    fontSize: theme.typography.sizes.lg,
    fontWeight: theme.typography.weights.semibold,
    textAlign: "center",
  },
  footer: {
    gap: theme.spacing.lg,
    marginTop: theme.spacing.sm,
  },
  blocked: {
    color: theme.colors.text,
    fontSize: theme.typography.sizes.sm,
  },
  totalRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  totalLabel: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.sizes.md,
  },
  total: {
    color: theme.colors.text,
    fontSize: theme.typography.sizes.xl,
    fontWeight: theme.typography.weights.bold,
  },
});

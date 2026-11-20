import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ClientOrderCard } from "@/components/client-order-card";
import { ListState } from "@/components/list-state";
import { PageScreen } from "@/components/page-screen";
import { PrimaryButton } from "@/components/primary-button";
import { ShopCatalog } from "@/components/shop-catalog";
import { useCart } from "@/lib/cart";
import { catalogKeys, useShopProducts } from "@/lib/catalog";
import { clientOrderKeys, useClientOrders, type ClientOrder } from "@/lib/client-orders";
import { orderKeys, useActiveOrder, useOrdersRealtime } from "@/lib/orders";
import { useSession } from "@/lib/session";
import { useRefreshOnFocus } from "@/lib/use-refresh-on-focus";
import { cartButtonLabel, cartLines, cartSummary } from "@/logic/cart";
import { homeCard, mostBought } from "@/logic/client-orders";
import { theme } from "@/theme";

// What an order change can move: the orders, whether the Shop lets the client buy, and the units left.
const REALTIME_KEYS = [clientOrderKeys.all, orderKeys.activeOrder, catalogKeys.shopProducts];

// The client Home, which since spec 010 is the Shop (RF-2 to RF-10, RF-32, RF-33): "Hola, <nombre>"
// with the cart button (its units as a badge, RF-7 to RF-9), the card of the order of spec 006 (the
// active one, or the last finished one of 7 days until "Ocultar"; nothing otherwise, RF-3), and the list
// of the Shop, with "Tu más comprado" on top (mostBought of its delivered orders, /feature 2026-11-18).
// No "Volver a comprar", no history (it moved to the Perfil) and no cart bar. One loading
// until the orders and the products are there, so the card never pushes the list down (RF-33). It
// refreshes through Realtime, when the tab gains focus again, when the app comes to the foreground
// (QueryProvider) and when the list is pulled down (RF-6). What the client hid lives here, in memory:
// the tab stays mounted while the session lasts (spec 006, RF-11).
export default function ClientHome() {
  const orders = useClientOrders();
  const products = useShopProducts();
  const activeOrder = useActiveOrder();
  const cart = useCart();
  const { profile } = useSession();
  const [hidden, setHidden] = useState<ReadonlySet<number>>(() => new Set());

  useOrdersRealtime("client-orders", REALTIME_KEYS);
  useRefreshOnFocus(orders.refetch);
  useRefreshOnFocus(products.refetch);
  useRefreshOnFocus(activeOrder.refetch);

  const now = new Date();
  const units = cartSummary(cartLines(cart.items, products.data ?? undefined)).units;

  const open = (order: ClientOrder) =>
    router.push({ pathname: "/client/order/[id]", params: { id: String(order.id) } });

  return (
    <PageScreen
      title={profile?.first_name ? `Hola, ${profile.first_name}` : "Hola"}
      back={false}
      tabRoot
      action={{
        icon: "cart",
        label: cartButtonLabel(units),
        badge: units,
        onPress: () => router.navigate("/client/cart"),
      }}
      onRefresh={() => {
        void orders.refetch();
        void products.refetch();
        void activeOrder.refetch();
      }}
      refreshing={orders.isRefetching}
    >
      <ListState loading={orders.isPending || products.isPending} error={null} empty={null} onRetry={() => {}}>
        {orders.isError ? (
          <View style={styles.ordersError}>
            <Text style={styles.ordersErrorText} accessibilityRole="alert">
              No pudimos cargar tu pedido
            </Text>
            <PrimaryButton title="Reintentar" variant="outline" onPress={() => orders.refetch()} />
          </View>
        ) : (
          <ClientOrderCard
            card={homeCard(orders.data ?? [], now, hidden)}
            now={now}
            onOpen={open}
            onHide={(order) => setHidden((current) => new Set(current).add(order.id))}
          />
        )}
        <ShopCatalog featured={mostBought(orders.data ?? [], products.data ?? [])} />
      </ListState>
    </PageScreen>
  );
}

const styles = StyleSheet.create({
  // In place of the card (RF-32): the Shop below keeps working.
  ordersError: {
    gap: theme.spacing.lg,
    padding: theme.spacing.xl,
    borderRadius: theme.radii.xl,
    backgroundColor: theme.colors.surface,
  },
  ordersErrorText: {
    color: theme.colors.text,
    fontSize: theme.typography.sizes.md,
    textAlign: "center",
  },
});

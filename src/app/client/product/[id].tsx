import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Alert, Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { ListState } from "@/components/list-state";
import { Notice } from "@/components/notice";
import { PrimaryButton } from "@/components/primary-button";
import { RoundButton } from "@/components/round-button";
import { ScreenBackground } from "@/components/screen-background";
import { ScreenHeader } from "@/components/screen-header";
import { useCart } from "@/lib/cart";
import { useShopProducts, type ShopProduct } from "@/lib/catalog";
import { useActiveOrder } from "@/lib/orders";
import { useRefreshOnFocus } from "@/lib/use-refresh-on-focus";
import { addErrorMessage, addRoom, cartButtonLabel, cartLines, cartSummary, quantityOf } from "@/logic/cart";
import { formatARS } from "@/logic/currency";
import { formatRemaining } from "@/logic/stock";
import { theme } from "@/theme";

// The product screen (spec 003, RF-29 and RF-36 to RF-43, cambio del 2026-11-18; it replaces the detail
// modal and RF-9 of spec 004). Opened from the Shop, above the tabs. The product is the one of the last
// Shop update: opening the screen refetches it (the query is stale on mount) and so does coming back to
// it (RF-42). No Figma: the author's reference, the big image on top and a sheet with the texts, the
// selector and the two buttons (brief confirmed on 2026-11-18). create_order checks everything again.
export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const products = useShopProducts();
  const activeOrder = useActiveOrder();
  const cart = useCart();

  useRefreshOnFocus(products.refetch);
  useRefreshOnFocus(activeOrder.refetch);

  const product = products.data?.find((candidate) => candidate.id === Number(id));
  const units = cartSummary(cartLines(cart.items, products.data ?? undefined)).units;

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.fill} edges={["top", "left", "right"]}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <ScreenHeader
              action={{
                icon: "cart",
                label: cartButtonLabel(units),
                badge: units,
                onPress: () => router.dismissTo("/client/cart"),
              }}
            />
          </View>
          {/* A refresh that fails keeps the product already loaded; the error only replaces nothing. */}
          {products.isPending || (products.isError && !products.data) ? (
            <View style={styles.state}>
              <ListState
                loading={products.isPending}
                error={products.isError && !products.data ? "No pudimos cargar el producto" : null}
                empty={null}
                onRetry={() => products.refetch()}
              >
                {null}
              </ListState>
            </View>
          ) : product ? (
            <ProductDetail product={product} hasActiveOrder={Boolean(activeOrder.data)} />
          ) : (
            // RF-43: it left the Shop (deactivated, or its type or format) while the screen was open.
            <View style={[styles.state, styles.gone]}>
              <Text style={styles.goneText}>Este producto ya no está a la venta</Text>
              <PrimaryButton title="Volver a la Tienda" variant="outline" onPress={() => router.back()} />
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </ScreenBackground>
  );
}

function ProductDetail({ product, hasActiveOrder }: { product: ShopProduct; hasActiveOrder: boolean }) {
  const cart = useCart();
  const insets = useSafeAreaInsets();
  const [chosen, setChosen] = useState(1);
  // One add per visit: a second tap while the screen is leaving would add again and navigate twice.
  // Coming back (from the checkout) allows it again.
  const leaving = useRef(false);
  useFocusEffect(
    useCallback(() => {
      leaving.current = false;
    }, []),
  );

  // RF-37, RF-41: what fits on top of the cart; RF-42: the chosen quantity follows a lower maximum.
  const room = addRoom(cart.items, product, hasActiveOrder);
  const quantity = room.max > 0 ? Math.min(chosen, room.max) : 1;
  const disabled = room.max === 0;
  const inCart = quantityOf(cart.items, product.id);

  // RF-39, RF-40. The cart decides again with its own state; if it refuses, it says why and stays.
  function add(then: () => void) {
    if (leaving.current) return;
    const error = cart.add(product, quantity);
    if (error) {
      Alert.alert(addErrorMessage(error));
      return;
    }
    leaving.current = true;
    setChosen(1);
    then();
  }

  return (
    <View style={styles.detail}>
      <Image
        testID="egg-image"
        source={require("@/assets/images/egg.png")}
        style={styles.image}
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
      <View style={[styles.sheet, { paddingBottom: theme.spacing.xxxl + insets.bottom }]}>
        <View style={styles.texts}>
          <Text style={styles.name} accessibilityRole="header">
            {product.name}
          </Text>
          {product.description ? <Text style={styles.description}>{product.description}</Text> : null}
          <Text style={styles.price}>{formatARS(product.price)}</Text>
          <Text style={styles.secondary}>{formatRemaining(product.units_available)}</Text>
        </View>

        <View style={styles.selector}>
          <RoundButton
            icon="minus"
            label="Quitar una unidad"
            disabled={disabled || quantity <= 1}
            onPress={() => setChosen(quantity - 1)}
          />
          <Text style={styles.quantity} accessibilityLabel={`Cantidad: ${quantity}`}>
            {quantity}
          </Text>
          <RoundButton
            icon="plus"
            label="Sumar una unidad"
            disabled={disabled || quantity >= room.max}
            onPress={() => setChosen(quantity + 1)}
          />
        </View>
        {inCart > 0 ? <Text style={styles.secondary}>{`Ya tenés ${inCart} en el carrito`}</Text> : null}
        {/* "Sin stock" is already the line of the units left. */}
        {room.reason && room.reason !== "unavailable" ? <Notice message={addErrorMessage(room.reason)} /> : null}

        <View style={styles.buttons}>
          <PrimaryButton
            title="Comprar"
            disabled={disabled}
            onPress={() => add(() => router.push("/client/checkout"))}
          />
          <PrimaryButton
            title="Agregar al carrito"
            variant="outline"
            disabled={disabled}
            onPress={() => add(() => router.back())}
          />
        </View>
      </View>
    </View>
  );
}

const IMAGE_SIZE = 200;

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  // The sheet reaches the bottom edge even when its content is short.
  content: {
    flexGrow: 1,
  },
  header: {
    paddingHorizontal: theme.screenMargin,
    paddingTop: theme.spacing.sm,
  },
  detail: {
    flexGrow: 1,
  },
  image: {
    width: IMAGE_SIZE,
    height: IMAGE_SIZE,
    alignSelf: "center",
    marginVertical: theme.spacing.xxxl,
  },
  // The reference: a sheet with round top corners, from the image to the bottom of the screen.
  sheet: {
    flexGrow: 1,
    alignItems: "stretch",
    gap: theme.spacing.xl,
    paddingTop: theme.spacing.xxxl,
    paddingHorizontal: theme.screenMargin,
    borderTopLeftRadius: theme.radii.xl,
    borderTopRightRadius: theme.radii.xl,
    backgroundColor: theme.colors.surface,
  },
  texts: {
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  name: {
    color: theme.colors.text,
    fontSize: theme.typography.sizes.xl,
    fontWeight: theme.typography.weights.semibold,
    textAlign: "center",
  },
  // textSecondary on surface: 4.94:1.
  description: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.sizes.md,
    textAlign: "center",
  },
  price: {
    marginTop: theme.spacing.xs,
    color: theme.colors.text,
    fontSize: theme.typography.sizes.lg,
    fontWeight: theme.typography.weights.semibold,
  },
  secondary: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.sizes.sm,
    textAlign: "center",
  },
  selector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.xxl,
  },
  // Wide enough for two digits, so the buttons do not move.
  quantity: {
    minWidth: 32,
    color: theme.colors.text,
    fontSize: theme.typography.sizes.xl,
    fontWeight: theme.typography.weights.semibold,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  buttons: {
    gap: theme.spacing.md,
  },
  // Loading, error and a product that left the Shop: inside the side margin (the sheet is edge to edge).
  state: {
    paddingHorizontal: theme.screenMargin,
  },
  gone: {
    gap: theme.spacing.lg,
    paddingVertical: theme.spacing.huge,
  },
  goneText: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.sizes.md,
    textAlign: "center",
  },
});

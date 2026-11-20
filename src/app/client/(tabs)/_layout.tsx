import { Tabs } from "expo-router/js-tabs";
import { useEffect } from "react";

import { TabBar } from "@/components/tab-bar";
import { useCart } from "@/lib/cart";
import { useActiveOrder } from "@/lib/orders";
import { theme } from "@/theme";

// Client tabs (spec 002: RF-25, RF-27), inside the client Stack (spec 004). Since spec 010 (RF-1): Home
// (the Shop), Carrito and Perfil. The titles are the accessible names of the icons.
const ICONS = { index: "home-simple", cart: "cart", profile: "user" } as const;

export default function ClientTabsLayout() {
  useEmptyCartWhileOrderActive();

  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: theme.colors.canvas } }}
      tabBar={(props) => <TabBar {...props} icons={ICONS} />}
    >
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="cart" options={{ title: "Carrito" }} />
      <Tabs.Screen name="profile" options={{ title: "Perfil" }} />
    </Tabs>
  );
}

// Spec 010, RF-34: while the client has an active order, the cart stays empty, also when it had products
// from before (the order was confirmed on another phone). Here because this layout lives as long as the
// client session and covers the three tabs and the checkout. The active order refreshes through the
// Realtime of the Home and when the Home or the cart gain focus; while it loads, the cart stays as it is.
function useEmptyCartWhileOrderActive() {
  const activeOrder = useActiveOrder();
  const cart = useCart();
  const hasActiveOrder = Boolean(activeOrder.data);
  const hasItems = cart.items.length > 0;

  useEffect(() => {
    if (hasActiveOrder && hasItems) cart.clear();
  }, [hasActiveOrder, hasItems, cart]);
}

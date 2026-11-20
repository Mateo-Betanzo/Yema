import { Stack } from "expo-router";
import { useReducedMotion } from "react-native-reanimated";

import { profileMenuOptions } from "@/components/profile-menu-options";
import { CartProvider } from "@/lib/cart";
import { theme } from "@/theme";

// Client screens (spec 004): the tabs, and above them the checkout, the confirmation, the order detail,
// since spec 010 the menu of the Perfil, the history and "Editar perfil", and the product screen (spec
// 003, cambio del 2026-11-18), which cover the floating tab bar and get the native "back", as in admin/. The cart lives here, in memory (RF-19): it is shared
// by every client screen and lost when the group unmounts, which happens when the session closes
// (Stack.Protected) or the app is closed.
export default function ClientLayout() {
  // Spec 010, RF-19: with "Reduce motion", the menu appears and goes away without sliding.
  const reduced = useReducedMotion();

  return (
    <CartProvider>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.canvas } }}>
        <Stack.Screen name="(tabs)" />
        {/* Spec 006: the order detail slides up over the Home, as the admin's (spec 005). */}
        <Stack.Screen name="order/[id]" options={{ presentation: "modal" }} />
        {/* Spec 003, RF-29 (cambio del 2026-11-18): the product screen, a native push over the tabs. */}
        <Stack.Screen name="product/[id]" />
        {/* Spec 010, RF-17: the native sheet of the menu (shared with the admin since spec 011). */}
        <Stack.Screen name="menu" options={profileMenuOptions(reduced)} />
      </Stack>
    </CartProvider>
  );
}

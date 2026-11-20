import { Stack } from "expo-router";
import { useReducedMotion } from "react-native-reanimated";

import { profileMenuOptions } from "@/components/profile-menu-options";
import { theme } from "@/theme";

// Admin screens (spec 003, RF-25): the tabs, and above them the screens that open from a tab (forms,
// types and formats, the schedule) and, since spec 011, the menu of the Perfil with the stock history and
// "Editar perfil". Opened over the tabs, they cover the floating tab bar and get the native "back".
export default function AdminLayout() {
  // Spec 011, RF-4: with "Reduce motion", the menu appears and goes away without sliding.
  const reduced = useReducedMotion();

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.canvas } }}>
      <Stack.Screen name="(tabs)" />
      {/* Spec 005: the order detail slides up over the Home, as the modal card of the Figma. */}
      <Stack.Screen name="order/[id]" options={{ presentation: "modal" }} />
      {/* Spec 011, RF-2: the native sheet of the menu, the same as the client's (spec 010). */}
      <Stack.Screen name="menu" options={profileMenuOptions(reduced)} />
    </Stack>
  );
}

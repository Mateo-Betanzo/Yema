import { Stack } from "expo-router";

import { theme } from "@/theme";

// Screens without a session (spec 002 · T6). Welcome, Login and Sign-up arrive in T7 and T8.
export default function Layout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.canvas } }} />;
}

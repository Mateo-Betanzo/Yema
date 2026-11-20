import { Tabs } from "expo-router/js-tabs";

import { TabBar } from "@/components/tab-bar";
import { theme } from "@/theme";

// Admin tabs (spec 002: RF-26, RF-27), inside the admin Stack (spec 003). The titles are the accessible
// names of the icons.
const ICONS = { index: "home-simple", dashboard: "view-grid", products: "package", profile: "user" } as const;

export default function AdminTabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: theme.colors.canvas } }}
      tabBar={(props) => <TabBar {...props} icons={ICONS} />}
    >
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="dashboard" options={{ title: "Dashboard" }} />
      <Tabs.Screen name="products" options={{ title: "Productos" }} />
      <Tabs.Screen name="profile" options={{ title: "Perfil" }} />
    </Tabs>
  );
}

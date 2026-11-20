import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { Appearance, Platform } from "react-native";

import { completeGoogleSignInOnWeb } from "@/lib/google-auth";
import { QueryProvider } from "@/lib/query-client";
import { SessionProvider, useSession } from "@/lib/session";
import { theme } from "@/theme";

// The app is dark only. userInterfaceStyle in app.json covers the build, and this covers native
// elements (alerts, pickers) when the phone is in light mode. Not on web: Expo CLI loads the routes
// in Node with react-native-web, which has no setColorScheme and would throw while starting.
if (Platform.OS !== "web") {
  Appearance.setColorScheme("dark");
}

// Web: the popup of "Continuar con Google" hands its answer to the app that opened it (spec 002, RF-45).
completeGoogleSignInOnWeb();

// The splash stays up until we know whether there is a session and with which role.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <QueryProvider>
      <SessionProvider>
        {/* "light", not "auto": the icons must not depend on the phone's color scheme. */}
        <StatusBar style="light" />
        <RootNavigator />
      </SessionProvider>
    </QueryProvider>
  );
}

// Each group opens only in its session state (RF-1, RF-25, RF-26). A screen that becomes closed is
// removed from the history (RF-30), and a link to a closed screen goes to the index route, which
// redirects to the user's own place (RF-31).
function RootNavigator() {
  const { status } = useSession();

  useEffect(() => {
    if (status !== "loading") SplashScreen.hide();
  }, [status]);

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.canvas } }}>
      <Stack.Screen name="index" />
      <Stack.Protected guard={status === "signed-out"}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={status === "client"}>
        <Stack.Screen name="client" />
      </Stack.Protected>
      <Stack.Protected guard={status === "admin"}>
        <Stack.Screen name="admin" />
      </Stack.Protected>
    </Stack>
  );
}

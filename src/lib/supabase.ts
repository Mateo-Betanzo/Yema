// Supabase client, following the Supabase quickstart for Expo (RF-21, RF-23).
// Only the URL and the publishable key reach the app; never the secret or service role key.
import "react-native-url-polyfill/auto";
import "expo-sqlite/localStorage/install";

import { createClient } from "@supabase/supabase-js";
import { AppState } from "react-native";

import type { Database } from "./database.types";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !publishableKey) {
  throw new Error(
    "Faltan EXPO_PUBLIC_SUPABASE_URL o EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: copiá .env.example como .env.local y completalo.",
  );
}

export const supabase = createClient<Database>(url, publishableKey, {
  auth: {
    // The session stays on the device (expo-sqlite's localStorage) across restarts.
    storage: localStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Outside the browser the refresh timer would keep running in the background: Supabase recommends
// tying it to the foreground. Registered once, when the module loads.
AppState.addEventListener("change", (state) => {
  if (state === "active") {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});

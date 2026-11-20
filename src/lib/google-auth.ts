// "Continuar con Google" (spec 002, change of 2026-11-19: RF-45 to RF-47, RF-49, RF-19). Supabase's
// implicit flow in the system browser, as its guide for Expo, without expo-auth-session: the link back to
// Login is the app's own (exp://…/--/login in Expo Go) and the tokens are read by parseAuthRedirect.
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";

import { authErrorMessage, NO_ACCOUNT_FOR_GOOGLE } from "@/logic/auth-errors";
import { parseAuthRedirect } from "@/logic/auth-flow";

import { supabase } from "./supabase";

/**
 * Web only: Google comes back to Login inside the popup that openAuthSessionAsync opened. That page
 * hands the URL to the window that opened it and the popup closes; without this the popup just shows
 * the app again (bug of 2026-11-19). Called once when the app loads, before the router moves.
 */
export function completeGoogleSignInOnWeb(): void {
  if (Platform.OS === "web") WebBrowser.maybeCompleteAuthSession();
}

export type GoogleSignIn = { kind: "signed-in" } | { kind: "cancelled" } | { kind: "error"; message: string };

const FAILED: GoogleSignIn = { kind: "error", message: authErrorMessage(null, "google") };

/** On success the session changes and the guards of the root layout take the user to their Home. */
export async function signInWithGoogle(): Promise<GoogleSignIn> {
  const redirectTo = Linking.createURL("login");
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error || !data.url) return { kind: "error", message: authErrorMessage(error, "google") };

  let result: WebBrowser.WebBrowserAuthSessionResult;
  try {
    result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  } catch {
    return FAILED;
  }
  // RF-47: the user closed Google's page.
  if (result.type !== "success") return { kind: "cancelled" };

  const redirect = parseAuthRedirect(result.url);
  if (redirect?.kind === "no-account") return { kind: "error", message: NO_ACCOUNT_FOR_GOOGLE };
  if (redirect?.kind !== "tokens") return FAILED;

  const { error: sessionError } = await supabase.auth.setSession({
    access_token: redirect.accessToken,
    refresh_token: redirect.refreshToken,
  });
  if (sessionError) return { kind: "error", message: authErrorMessage(sessionError, "google") };
  return { kind: "signed-in" };
}

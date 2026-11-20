import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";

import { Platform } from "react-native";

import { completeGoogleSignInOnWeb, signInWithGoogle } from "@/lib/google-auth";

// Spec 002 · T14 (change of 2026-11-19): "Continuar con Google" through the system browser
// (RF-45 to RF-47, RF-49, RF-19). Supabase, the browser and the link of the app are fakes.
const REDIRECT = "exp://192.168.0.10:8081/--/login";
const GOOGLE = "http://127.0.0.1:54321/auth/v1/authorize?provider=google";

const mockSignInWithOAuth = jest.fn();
const mockSetSession = jest.fn();
const mockOpenAuthSession = jest.fn();
const mockMaybeComplete = jest.fn();

jest.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      signInWithOAuth: (options: unknown) => mockSignInWithOAuth(options),
      setSession: (tokens: unknown) => mockSetSession(tokens),
    },
  },
}));
jest.mock("expo-linking", () => ({ createURL: (path: string) => `exp://192.168.0.10:8081/--/${path}` }));
jest.mock("expo-web-browser", () => ({
  openAuthSessionAsync: (url: string, redirect: string) => mockOpenAuthSession(url, redirect),
  maybeCompleteAuthSession: () => mockMaybeComplete(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockSignInWithOAuth.mockResolvedValue({ data: { provider: "google", url: GOOGLE }, error: null });
  mockSetSession.mockResolvedValue({ data: { session: {} }, error: null });
});

describe("signInWithGoogle", () => {
  test("asks Supabase for Google's page without leaving the app, and back to Login", async () => {
    mockOpenAuthSession.mockResolvedValue({ type: "cancel" });
    await signInWithGoogle();
    expect(mockSignInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: REDIRECT, skipBrowserRedirect: true },
    });
    expect(mockOpenAuthSession).toHaveBeenCalledWith(GOOGLE, REDIRECT);
  });

  test("RF-45: with the tokens, opens the session (the guards take the user to the Home)", async () => {
    mockOpenAuthSession.mockResolvedValue({ type: "success", url: `${REDIRECT}#access_token=acc&refresh_token=ref` });
    expect(await signInWithGoogle()).toEqual({ kind: "signed-in" });
    expect(mockSetSession).toHaveBeenCalledWith({ access_token: "acc", refresh_token: "ref" });
  });

  test.each(["cancel", "dismiss", "locked"])("RF-47: closing Google (%s) is not an error", async (type) => {
    mockOpenAuthSession.mockResolvedValue({ type });
    expect(await signInWithGoogle()).toEqual({ kind: "cancelled" });
    expect(mockSetSession).not.toHaveBeenCalled();
  });

  test("RF-46: a Google account without an account of ours", async () => {
    mockOpenAuthSession.mockResolvedValue({
      type: "success",
      url: `${REDIRECT}?error=server_error&error_description=Database+error+saving+new+user`,
    });
    expect(await signInWithGoogle()).toEqual({
      kind: "error",
      message: "No hay una cuenta con ese email. Primero creá tu cuenta",
    });
  });

  test.each([
    ["another error from Google or Supabase", `${REDIRECT}#error=access_denied&error_description=Unverified+email`],
    ["a link without tokens", REDIRECT],
  ])("RF-49: %s", async (_case, url) => {
    mockOpenAuthSession.mockResolvedValue({ type: "success", url });
    expect(await signInWithGoogle()).toEqual({ kind: "error", message: "No pudimos iniciar sesión con Google. Probá de nuevo" });
    expect(mockSetSession).not.toHaveBeenCalled();
  });

  test("RF-49: Supabase cannot build Google's page", async () => {
    mockSignInWithOAuth.mockResolvedValue({ data: { provider: "google", url: null }, error: new AuthApiError("boom", 500, "unexpected_failure") });
    expect(await signInWithGoogle()).toEqual({ kind: "error", message: "No pudimos iniciar sesión con Google. Probá de nuevo" });
    expect(mockOpenAuthSession).not.toHaveBeenCalled();
  });

  test("RF-49: the browser cannot open", async () => {
    mockOpenAuthSession.mockRejectedValue(new Error("No browser"));
    expect(await signInWithGoogle()).toEqual({ kind: "error", message: "No pudimos iniciar sesión con Google. Probá de nuevo" });
  });

  test("RF-19: no connection when opening the session", async () => {
    mockOpenAuthSession.mockResolvedValue({ type: "success", url: `${REDIRECT}#access_token=acc&refresh_token=ref` });
    mockSetSession.mockResolvedValue({ data: { session: null }, error: new AuthRetryableFetchError("fetch failed", 0) });
    expect(await signInWithGoogle()).toEqual({
      kind: "error",
      message: "No hay conexión. Revisá tu internet e intentá de nuevo",
    });
  });
});

// On web, Google comes back to Login inside the popup: that page must hand the URL to the window that
// opened it, or the popup just shows the app again (bug of 2026-11-19).
describe("completeGoogleSignInOnWeb", () => {
  afterEach(() => jest.restoreAllMocks());

  test("on web, hands Google's answer to the window that opened the popup", () => {
    jest.replaceProperty(Platform, "OS", "web");
    completeGoogleSignInOnWeb();
    expect(mockMaybeComplete).toHaveBeenCalledTimes(1);
  });

  test.each(["ios", "android"] as const)("on %s it does nothing (the auth session returns by itself)", (os) => {
    jest.replaceProperty(Platform, "OS", os);
    completeGoogleSignInOnWeb();
    expect(mockMaybeComplete).not.toHaveBeenCalled();
  });
});

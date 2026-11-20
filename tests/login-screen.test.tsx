import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";

import Login from "@/app/(auth)/login";

// Spec 002 · T7: Login (RF-2, RF-13, RF-17 to RF-20). Supabase and the router are replaced: on
// success the session (tests/session.test.tsx) and the guards (tests/root-layout.test.tsx) take the
// user to their Home.
type SignInResult = { error: unknown };

const mockSignIn = jest.fn(async (_credentials: { email: string; password: string }): Promise<SignInResult> => ({
  error: null,
}));
const mockResend = jest.fn(async (_params: unknown): Promise<{ error: unknown }> => ({ error: null }));
const mockReplace = jest.fn();
const mockPush = jest.fn();

jest.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      signInWithPassword: (credentials: { email: string; password: string }) => mockSignIn(credentials),
      resend: (params: unknown) => mockResend(params),
    },
  },
}));
type GoogleResult = { kind: "signed-in" } | { kind: "cancelled" } | { kind: "error"; message: string };
const mockSignInWithGoogle = jest.fn(async (): Promise<GoogleResult> => ({ kind: "signed-in" }));
jest.mock("@/lib/google-auth", () => ({ signInWithGoogle: () => mockSignInWithGoogle() }));
jest.mock("expo-router", () => ({
  router: { replace: (href: unknown) => mockReplace(href), push: (href: unknown) => mockPush(href) },
}));

async function fill(email: string, password: string) {
  await fireEvent.changeText(screen.getByLabelText("Email"), email);
  await fireEvent.changeText(screen.getByLabelText("Contraseña"), password);
}

const submit = () => fireEvent.press(screen.getByRole("button", { name: "Iniciar sesión" }));

beforeEach(() => jest.clearAllMocks());

describe("login screen", () => {
  test("shows the title and both fields", async () => {
    await render(<Login />);
    expect(screen.getByRole("header", { name: "Iniciá sesión" })).toBeOnTheScreen();
    expect(screen.getByLabelText("Email")).toBeOnTheScreen();
    expect(screen.getByLabelText("Contraseña")).toBeOnTheScreen();
  });

  // Change of 2026-11-19 (T16), as the Figma.
  test("RF-50: '¿Olvidaste tu contraseña?' opens the recovery with the email typed so far", async () => {
    await render(<Login />);
    await fireEvent.changeText(screen.getByLabelText("Email"), " Ana@Example.com ");
    await fireEvent.press(screen.getByRole("link", { name: "¿Olvidaste tu contraseña?" }));
    // A push: going back returns to Login (RF-58).
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/forgot-password", params: { email: "ana@example.com" } });
  });

  test("RF-13: an empty form is not sent and each field says so", async () => {
    await render(<Login />);
    await fill("   ", "");
    await submit();
    expect(screen.getAllByText("Completá este campo")).toHaveLength(2);
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  test("RF-13 / RF-17: sends the email trimmed and in lowercase, and the password as typed", async () => {
    await render(<Login />);
    await fill("  Ana@Example.COM ", " clave1234 ");
    await submit();
    expect(mockSignIn).toHaveBeenCalledWith({ email: "ana@example.com", password: " clave1234 " });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("RF-20: while sending, the button is disabled and busy, and a second tap sends nothing", async () => {
    let answer: (result: SignInResult) => void = () => {};
    mockSignIn.mockImplementationOnce(() => new Promise<SignInResult>((resolve) => (answer = resolve)));
    await render(<Login />);
    await fill("ana@example.com", "clave1234");

    // fireEvent.press waits for onPress, which stays pending here: the first tap is not awaited.
    const firstTap = submit();
    const button = screen.getByRole("button", { name: "Iniciar sesión" });
    await waitFor(() => expect(button).toBeDisabled());
    expect(button).toBeBusy();
    void submit();
    expect(mockSignIn).toHaveBeenCalledTimes(1);

    await act(async () => answer({ error: null }));
    await firstTap;
    expect(screen.getByRole("button", { name: "Iniciar sesión" })).toBeEnabled();
  });

  test("RF-18: wrong credentials show one message without saying which field failed", async () => {
    mockSignIn.mockResolvedValueOnce({
      error: new AuthApiError("Invalid login credentials", 400, "invalid_credentials"),
    });
    await render(<Login />);
    await fill("ana@example.com", "clave1234");
    await submit();
    expect(screen.getByRole("alert")).toHaveTextContent("Email o contraseña incorrectos");
    expect(screen.queryByText("Completá este campo")).toBeNull();
  });

  test("the error of the form is announced to the screen reader (VoiceOver does not read new text by itself)", async () => {
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    mockSignIn.mockResolvedValueOnce({
      error: new AuthApiError("Invalid login credentials", 400, "invalid_credentials"),
    });
    await render(<Login />);
    await fill("ana@example.com", "clave1234");
    await submit();
    expect(announce).toHaveBeenCalledWith("Email o contraseña incorrectos");
  });

  test("RF-19: without connection, says so and keeps what was typed", async () => {
    mockSignIn.mockResolvedValueOnce({ error: new AuthRetryableFetchError("fetch failed", 0) });
    await render(<Login />);
    await fill("ana@example.com", "clave1234");
    await submit();
    expect(screen.getByRole("alert")).toHaveTextContent("No hay conexión. Revisá tu internet e intentá de nuevo");
    expect(screen.getByLabelText("Email")).toHaveDisplayValue("ana@example.com");
    expect(screen.getByLabelText("Contraseña")).toHaveDisplayValue("clave1234");
  });

  test("the password is hidden and the eye button shows it", async () => {
    await render(<Login />);
    expect(screen.getByLabelText("Contraseña")).toHaveProp("secureTextEntry", true);
    await fireEvent.press(screen.getByRole("button", { name: "Mostrar contraseña" }));
    expect(screen.getByLabelText("Contraseña")).toHaveProp("secureTextEntry", false);
    expect(screen.getByRole("button", { name: "Ocultar contraseña" })).toBeOnTheScreen();
  });

  // Change of 2026-11-19 (T15).
  test("RF-42 / RF-43: an account that was never confirmed gets a new code and goes to confirm it", async () => {
    mockSignIn.mockResolvedValueOnce({ error: new AuthApiError("Email not confirmed", 400, "email_not_confirmed") });
    await render(<Login />);
    await fill(" Ana@Example.com ", "clave1234");
    await submit();
    expect(mockResend).toHaveBeenCalledWith({ type: "signup", email: "ana@example.com" });
    // A push: going back returns to Login.
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/confirm-email", params: { email: "ana@example.com" } });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("RF-42: within 60 s of the last code it still goes to confirm, without an error", async () => {
    mockSignIn.mockResolvedValueOnce({ error: new AuthApiError("Email not confirmed", 400, "email_not_confirmed") });
    mockResend.mockResolvedValueOnce({
      error: new AuthApiError("email rate limit exceeded", 429, "over_email_send_rate_limit"),
    });
    await render(<Login />);
    await fill("ana@example.com", "clave1234");
    await submit();
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/confirm-email", params: { email: "ana@example.com" } });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  // Change of 2026-11-19 (T17): "Continuar con Google" (signInWithGoogle in tests/google-auth.test.ts).
  test("RF-44: 'Continuar con Google' comes after 'Iniciar sesión'", async () => {
    await render(<Login />);
    const login = screen.getByRole("button", { name: "Iniciar sesión" });
    const google = screen.getByRole("button", { name: "Continuar con Google" });
    const all = screen.getAllByRole("button");
    expect(all.indexOf(google)).toBeGreaterThan(all.indexOf(login));
  });

  // /feature 2026-11-19: only the "G" of Google, centered (its name stays for screen readers).
  test("RF-44: Google is a round button with only its G, centered", async () => {
    await render(<Login />);
    const google = screen.getByRole("button", { name: "Continuar con Google" });
    expect(screen.queryByText("Continuar con Google")).toBeNull();
    expect(screen.getByTestId("icon:google", { includeHiddenElements: true })).toBeOnTheScreen();
    expect(google.parent?.props.style).toEqual(expect.objectContaining({ alignItems: "center" }));
  });

  test("RF-45: entering with Google leaves the rest to the session (no message)", async () => {
    await render(<Login />);
    await fireEvent.press(screen.getByRole("button", { name: "Continuar con Google" }));
    expect(mockSignInWithGoogle).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("RF-47: closing Google shows no error and keeps what was typed", async () => {
    mockSignInWithGoogle.mockResolvedValueOnce({ kind: "cancelled" });
    await render(<Login />);
    await fill("ana@example.com", "clave1234");
    await fireEvent.press(screen.getByRole("button", { name: "Continuar con Google" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByLabelText("Email")).toHaveDisplayValue("ana@example.com");
    expect(screen.getByRole("button", { name: "Continuar con Google" })).toBeEnabled();
  });

  test("RF-46 / RF-49: the message of Google is shown and what was typed stays", async () => {
    mockSignInWithGoogle.mockResolvedValueOnce({
      kind: "error",
      message: "No hay una cuenta con ese email. Primero creá tu cuenta",
    });
    await render(<Login />);
    await fill("ana@example.com", "clave1234");
    await fireEvent.press(screen.getByRole("button", { name: "Continuar con Google" }));
    expect(screen.getByRole("alert")).toHaveTextContent("No hay una cuenta con ese email. Primero creá tu cuenta");
    expect(screen.getByLabelText("Email")).toHaveDisplayValue("ana@example.com");
  });

  test("RF-20: while waiting for Google, both buttons are disabled and a second tap does nothing", async () => {
    let answer: (result: GoogleResult) => void = () => {};
    mockSignInWithGoogle.mockImplementationOnce(() => new Promise<GoogleResult>((resolve) => (answer = resolve)));
    await render(<Login />);
    const firstTap = fireEvent.press(screen.getByRole("button", { name: "Continuar con Google" }));
    const google = screen.getByRole("button", { name: "Continuar con Google" });
    await waitFor(() => expect(google).toBeDisabled());
    expect(google).toBeBusy();
    expect(screen.getByRole("button", { name: "Iniciar sesión" })).toBeDisabled();
    void fireEvent.press(google);
    await fill("ana@example.com", "clave1234");
    void submit();
    expect(mockSignInWithGoogle).toHaveBeenCalledTimes(1);
    expect(mockSignIn).not.toHaveBeenCalled();

    await act(async () => answer({ kind: "cancelled" }));
    await firstTap;
    expect(screen.getByRole("button", { name: "Iniciar sesión" })).toBeEnabled();
  });

  test("RF-20: while signing in with the password, Google cannot be started", async () => {
    let answer: (result: SignInResult) => void = () => {};
    mockSignIn.mockImplementationOnce(() => new Promise<SignInResult>((resolve) => (answer = resolve)));
    await render(<Login />);
    await fill("ana@example.com", "clave1234");
    const firstTap = submit();
    await waitFor(() => expect(screen.getByRole("button", { name: "Continuar con Google" })).toBeDisabled());
    void fireEvent.press(screen.getByRole("button", { name: "Continuar con Google" }));
    expect(mockSignInWithGoogle).not.toHaveBeenCalled();
    await act(async () => answer({ error: null }));
    await firstTap;
  });

  test("RF-2 / RF-3: the sign-up link replaces Login, so going back returns to Welcome", async () => {
    await render(<Login />);
    await fireEvent.press(screen.getByRole("link", { name: "Registrate" }));
    expect(mockReplace).toHaveBeenCalledWith("/sign-up");
  });
});

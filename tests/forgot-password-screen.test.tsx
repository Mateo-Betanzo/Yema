import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";

import ForgotPassword from "@/app/(auth)/forgot-password";

// Spec 002 · T16 (change of 2026-11-19): "Recuperar contraseña" (RF-50 to RF-58, RF-60, RF-61, RF-19,
// RF-20). Supabase and the route params are fakes. Verifying the code opens a session that the app does
// not enter (PASSWORD_RECOVERY); saving the new password does (USER_UPDATED, tests/session.test.tsx).
type Result = { error: unknown };

const mockReset = jest.fn(async (_email: string): Promise<Result> => ({ error: null }));
const mockVerifyOtp = jest.fn(async (_params: unknown): Promise<Result> => ({ error: null }));
const mockUpdateUser = jest.fn(async (_attributes: unknown): Promise<Result> => ({ error: null }));
const mockSignOut = jest.fn(async (_options: unknown): Promise<Result> => ({ error: null }));
let mockParams: { email?: string } = {};

jest.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      resetPasswordForEmail: (email: string) => mockReset(email),
      verifyOtp: (params: unknown) => mockVerifyOtp(params),
      updateUser: (attributes: unknown) => mockUpdateUser(attributes),
      signOut: (options: unknown) => mockSignOut(options),
    },
  },
}));
jest.mock("expo-router", () => ({ useLocalSearchParams: () => mockParams }));

const SENT = "Si hay una cuenta con ese email, te enviamos un código de 6 dígitos. Si no lo ves, revisá el spam.";
const press = (name: string) => fireEvent.press(screen.getByRole("button", { name }));

async function goToSecondStep(email = "ana@example.com") {
  await fireEvent.changeText(screen.getByLabelText("Email"), email);
  await press("Enviar código");
}

async function fillNewPassword(code: string, password: string, confirmation = password) {
  await fireEvent.changeText(screen.getByLabelText("Código"), code);
  await fireEvent.changeText(screen.getByLabelText("Contraseña nueva"), password);
  await fireEvent.changeText(screen.getByLabelText("Confirmá tu contraseña"), confirmation);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  jest.useFakeTimers({ now: new Date("2026-11-19T22:00:00.000Z") });
});

afterEach(() => {
  jest.useRealTimers();
});

describe("forgot password screen: the email", () => {
  test("RF-50: opens with the email already typed in Login", async () => {
    mockParams = { email: "ana@example.com" };
    await render(<ForgotPassword />);
    expect(screen.getByRole("header", { name: "Recuperar contraseña" })).toBeOnTheScreen();
    expect(screen.getByLabelText("Email")).toHaveDisplayValue("ana@example.com");
  });

  test("RF-53: an invalid email sends nothing and says so", async () => {
    await render(<ForgotPassword />);
    await goToSecondStep("ana@example");
    expect(screen.getByText("Ingresá un email válido, como nombre@ejemplo.com")).toBeOnTheScreen();
    expect(mockReset).not.toHaveBeenCalled();
  });

  test("RF-51 / RF-52: sends the code and moves on with the same message whether the account exists or not", async () => {
    await render(<ForgotPassword />);
    await goToSecondStep(" Ana@Example.com ");
    expect(mockReset).toHaveBeenCalledWith("ana@example.com");
    expect(screen.getByText(SENT)).toBeOnTheScreen();
    expect(screen.getByLabelText("Código")).toBeOnTheScreen();
    expect(screen.queryByLabelText("Email")).toBeNull();
  });

  test("RF-52: the screen reader hears that the code was sent (the button it was on is gone)", async () => {
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    await render(<ForgotPassword />);
    await goToSecondStep();
    expect(announce).toHaveBeenCalledWith(SENT);
  });

  test.each([
    ["RF-19", new AuthRetryableFetchError("fetch failed", 0), "No hay conexión. Revisá tu internet e intentá de nuevo"],
    [
      "RF-61",
      new AuthApiError("email rate limit exceeded", 429, "over_email_send_rate_limit"),
      "Mandamos demasiados emails. Esperá unos minutos y probá de nuevo",
    ],
  ])("%s: an error keeps the user on the email, with what was typed", async (_rf, error, message) => {
    mockReset.mockResolvedValueOnce({ error });
    await render(<ForgotPassword />);
    await goToSecondStep();
    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(screen.getByLabelText("Email")).toHaveDisplayValue("ana@example.com");
  });
});

describe("forgot password screen: the new password", () => {
  test("RF-55: invalid fields are marked and nothing is sent", async () => {
    await render(<ForgotPassword />);
    await goToSecondStep();
    await fillNewPassword("12", "corta", "otra");
    await press("Cambiar contraseña");
    expect(screen.getByText("Ingresá los 6 dígitos del código")).toBeOnTheScreen();
    expect(screen.getByText("Usá entre 8 y 72 caracteres, con al menos una letra y un número")).toBeOnTheScreen();
    expect(screen.getByText("Las contraseñas no coinciden")).toBeOnTheScreen();
    expect(mockVerifyOtp).not.toHaveBeenCalled();
  });

  test("RF-54: verifies the code and then saves the password (the session enters after that)", async () => {
    await render(<ForgotPassword />);
    await goToSecondStep();
    await fillNewPassword(" 123456 ", "nueva1234");
    await press("Cambiar contraseña");
    expect(mockVerifyOtp).toHaveBeenCalledWith({ email: "ana@example.com", token: "123456", type: "recovery" });
    expect(mockUpdateUser).toHaveBeenCalledWith({ password: "nueva1234" });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("RF-56: a wrong or expired code changes nothing and keeps what was typed", async () => {
    mockVerifyOtp.mockResolvedValueOnce({ error: new AuthApiError("Token has expired or is invalid", 403, "otp_expired") });
    await render(<ForgotPassword />);
    await goToSecondStep();
    await fillNewPassword("123456", "nueva1234");
    await press("Cambiar contraseña");
    expect(screen.getByRole("alert")).toHaveTextContent("El código no es válido o venció");
    expect(mockUpdateUser).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Código")).toHaveDisplayValue("123456");
  });

  test("RF-57: the same password says so and another one is saved without a new code", async () => {
    mockUpdateUser.mockResolvedValueOnce({
      error: new AuthApiError("New password should be different from the old password.", 422, "same_password"),
    });
    await render(<ForgotPassword />);
    await goToSecondStep();
    await fillNewPassword("123456", "vieja1234");
    await press("Cambiar contraseña");
    expect(screen.getByRole("alert")).toHaveTextContent("Elegí una contraseña distinta de la anterior");

    await fillNewPassword("123456", "nueva1234");
    await press("Cambiar contraseña");
    expect(mockVerifyOtp).toHaveBeenCalledTimes(1);
    expect(mockUpdateUser).toHaveBeenLastCalledWith({ password: "nueva1234" });
  });

  test("RF-58: leaving after the code was verified, without a new password, closes that session", async () => {
    mockUpdateUser.mockResolvedValueOnce({
      error: new AuthApiError("New password should be different from the old password.", 422, "same_password"),
    });
    const { unmount } = await render(<ForgotPassword />);
    await goToSecondStep();
    await fillNewPassword("123456", "vieja1234");
    await press("Cambiar contraseña");
    await act(async () => unmount());
    expect(mockSignOut).toHaveBeenCalledWith({ scope: "local" });
  });

  test("RF-58: leaving before verifying a code has no session to close", async () => {
    const { unmount } = await render(<ForgotPassword />);
    await goToSecondStep();
    await act(async () => unmount());
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  test("RF-54: after saving the password, leaving (to the Home) keeps the session", async () => {
    const { unmount } = await render(<ForgotPassword />);
    await goToSecondStep();
    await fillNewPassword("123456", "nueva1234");
    await press("Cambiar contraseña");
    await act(async () => unmount());
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  test("RF-60: the code was just sent, so resending waits 60 s and then sends it again", async () => {
    await render(<ForgotPassword />);
    await act(async () => jest.advanceTimersByTime(30_000));
    await goToSecondStep();
    expect(screen.getByText("Podés pedir otro código en 60 s")).toBeOnTheScreen();
    await act(async () => jest.advanceTimersByTime(60_000));
    await fireEvent.press(screen.getByRole("link", { name: "Reenviar código" }));
    expect(mockReset).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("alert")).toHaveTextContent("Te mandamos un código nuevo");
    expect(screen.getByText("Podés pedir otro código en 60 s")).toBeOnTheScreen();
  });

  test("RF-20: while sending, the button is busy and a second tap sends nothing", async () => {
    // waitFor with fake timers leaves the next test without a screen: this one does not need the clock.
    jest.useRealTimers();
    let answer: (result: Result) => void = () => {};
    mockVerifyOtp.mockImplementationOnce(() => new Promise<Result>((resolve) => (answer = resolve)));
    await render(<ForgotPassword />);
    await goToSecondStep();
    await fillNewPassword("123456", "nueva1234");
    const firstTap = press("Cambiar contraseña");
    const button = screen.getByRole("button", { name: "Cambiar contraseña" });
    await waitFor(() => expect(button).toBeDisabled());
    expect(button).toBeBusy();
    void press("Cambiar contraseña");
    expect(mockVerifyOtp).toHaveBeenCalledTimes(1);
    await act(async () => answer({ error: null }));
    await firstTap;
  });
});

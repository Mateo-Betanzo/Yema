import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import ConfirmEmail from "@/app/(auth)/confirm-email";

// Spec 002 · T15 (change of 2026-11-19): "Confirmá tu email" (RF-39 to RF-41, RF-60, RF-61, RF-19, RF-20).
// Supabase and the route params are fakes: on success the session (SIGNED_IN) and the guards take the
// client to their Home (tests/session.test.tsx).
type Result = { error: unknown };

const mockVerifyOtp = jest.fn(async (_params: unknown): Promise<Result> => ({ error: null }));
const mockResend = jest.fn(async (_params: unknown): Promise<Result> => ({ error: null }));

jest.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      verifyOtp: (params: unknown) => mockVerifyOtp(params),
      resend: (params: unknown) => mockResend(params),
    },
  },
}));
jest.mock("expo-router", () => ({ useLocalSearchParams: () => ({ email: "ana@example.com" }) }));

const typeCode = (code: string) => fireEvent.changeText(screen.getByLabelText("Código"), code);
const confirm = () => fireEvent.press(screen.getByRole("button", { name: "Confirmar" }));

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: new Date("2026-11-19T22:00:00.000Z") });
});

afterEach(() => {
  jest.useRealTimers();
});

describe("confirm email screen", () => {
  test("says where the code went and asks for it with the number pad", async () => {
    await render(<ConfirmEmail />);
    expect(screen.getByRole("header", { name: "Confirmá tu email" })).toBeOnTheScreen();
    expect(screen.getByText(/ana@example\.com/)).toBeOnTheScreen();
    const field = screen.getByLabelText("Código");
    expect(field).toHaveProp("keyboardType", "number-pad");
    expect(field).toHaveProp("textContentType", "oneTimeCode");
    expect(field).toHaveProp("autoComplete", "one-time-code");
    expect(field).toHaveProp("maxLength", 6);
  });

  test("RF-40: a code without 6 digits is not sent", async () => {
    await render(<ConfirmEmail />);
    await typeCode("1234");
    await confirm();
    expect(screen.getByText("Ingresá los 6 dígitos del código")).toBeOnTheScreen();
    expect(mockVerifyOtp).not.toHaveBeenCalled();
  });

  test("RF-39: the right code confirms the account (the session takes the client to the Home)", async () => {
    await render(<ConfirmEmail />);
    await typeCode(" 123456 ");
    await confirm();
    expect(mockVerifyOtp).toHaveBeenCalledWith({ email: "ana@example.com", token: "123456", type: "email" });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("RF-41: a wrong or expired code says so and keeps what was typed", async () => {
    mockVerifyOtp.mockResolvedValueOnce({ error: new AuthApiError("Token has expired or is invalid", 403, "otp_expired") });
    await render(<ConfirmEmail />);
    await typeCode("123456");
    await confirm();
    expect(screen.getByRole("alert")).toHaveTextContent("El código no es válido o venció");
    expect(screen.getByLabelText("Código")).toHaveDisplayValue("123456");
  });

  test("RF-19: without connection, says so", async () => {
    mockVerifyOtp.mockResolvedValueOnce({ error: new AuthRetryableFetchError("fetch failed", 0) });
    await render(<ConfirmEmail />);
    await typeCode("123456");
    await confirm();
    expect(screen.getByRole("alert")).toHaveTextContent("No hay conexión. Revisá tu internet e intentá de nuevo");
  });

  test("RF-20: while sending, the button is busy and a second tap sends nothing", async () => {
    // waitFor with fake timers leaves the next test without a screen: this one does not need the clock.
    jest.useRealTimers();
    let answer: (result: Result) => void = () => {};
    mockVerifyOtp.mockImplementationOnce(() => new Promise<Result>((resolve) => (answer = resolve)));
    await render(<ConfirmEmail />);
    await typeCode("123456");
    const firstTap = confirm();
    const button = screen.getByRole("button", { name: "Confirmar" });
    await waitFor(() => expect(button).toBeDisabled());
    expect(button).toBeBusy();
    void confirm();
    expect(mockVerifyOtp).toHaveBeenCalledTimes(1);
    await act(async () => answer({ error: null }));
    await firstTap;
  });

  test("RF-60: the code was just sent, so resending waits 60 s", async () => {
    await render(<ConfirmEmail />);
    expect(screen.getByText("Podés pedir otro código en 60 s")).toBeOnTheScreen();
    expect(screen.queryByRole("link", { name: "Reenviar código" })).toBeNull();
    await act(async () => jest.advanceTimersByTime(15_000));
    expect(screen.getByText("Podés pedir otro código en 45 s")).toBeOnTheScreen();
  });

  test("RF-60: after 60 s a new code can be sent, and the wait starts again", async () => {
    await render(<ConfirmEmail />);
    await act(async () => jest.advanceTimersByTime(60_000));
    await fireEvent.press(screen.getByRole("link", { name: "Reenviar código" }));
    expect(mockResend).toHaveBeenCalledWith({ type: "signup", email: "ana@example.com" });
    expect(screen.getByRole("alert")).toHaveTextContent("Te mandamos un código nuevo");
    expect(screen.getByText("Podés pedir otro código en 60 s")).toBeOnTheScreen();
  });

  test("RF-61: too many emails says so and lets the user try later", async () => {
    mockResend.mockResolvedValueOnce({
      error: new AuthApiError("email rate limit exceeded", 429, "over_email_send_rate_limit"),
    });
    await render(<ConfirmEmail />);
    await act(async () => jest.advanceTimersByTime(60_000));
    await fireEvent.press(screen.getByRole("link", { name: "Reenviar código" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Mandamos demasiados emails. Esperá unos minutos y probá de nuevo");
    expect(screen.getByRole("link", { name: "Reenviar código" })).toBeOnTheScreen();
  });
});

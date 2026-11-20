import { AuthApiError, AuthRetryableFetchError, AuthWeakPasswordError } from "@supabase/supabase-js";

import { authErrorMessage } from "@/logic/auth-errors";

const ACTIONS = ["sign-up", "sign-in", "confirm", "resend", "recover", "reset", "google"] as const;

// Codes verified against local Supabase (plan 002, "Funciones puras", and the table of the change of
// 2026-11-19).
describe("authErrorMessage", () => {
  test("RF-12: an email that is already registered points to the password recovery", () => {
    const error = new AuthApiError("User already registered", 422, "user_already_exists");
    expect(authErrorMessage(error, "sign-up")).toBe(
      "Ese email ya está registrado. Si es tuyo, usá ¿Olvidaste tu contraseña?",
    );
  });

  test("RF-18: wrong email or password, without saying which", () => {
    const error = new AuthApiError("Invalid login credentials", 400, "invalid_credentials");
    expect(authErrorMessage(error, "sign-in")).toBe("Email o contraseña incorrectos");
  });

  // supabase-js raises AuthRetryableFetchError both without connection (status 0) and when the server
  // answers 5xx, as when the profile breaks a check (status 500): only the first one is "no connection".
  test.each(ACTIONS)("RF-19: no connection on %s", (action) => {
    const error = new AuthRetryableFetchError("fetch failed", 0);
    expect(authErrorMessage(error, action)).toBe("No hay conexión. Revisá tu internet e intentá de nuevo");
  });

  test.each([
    ["a profile rejected by a check", new AuthRetryableFetchError("Database error saving new user", 500)],
    ["a server error", new AuthApiError("Internal error", 500, "unexpected_failure")],
    ["a weak password", new AuthWeakPasswordError("Password should contain…", 422, ["characters"])],
    ["an email the server rejects", new AuthApiError("Unable to validate email address", 400, "validation_failed")],
    ["a plain error", new Error("boom")],
    ["something that is not an error", "boom"],
    ["nothing", undefined],
  ])("RF-15: any other error on sign-up (%s)", (_case, error) => {
    expect(authErrorMessage(error, "sign-up")).toBe("No pudimos crear tu cuenta. Intentá de nuevo");
  });

  test("any other error on sign-in", () => {
    const error = new AuthApiError("Request rate limit reached", 429, "over_request_rate_limit");
    expect(authErrorMessage(error, "sign-in")).toBe("No pudimos iniciar sesión. Intentá de nuevo");
  });

  // Change of 2026-11-19.
  test.each(["confirm", "reset"] as const)("RF-41 / RF-56: a wrong or expired code on %s", (action) => {
    // The server answers the same for both: 403 otp_expired.
    const error = new AuthApiError("Token has expired or is invalid", 403, "otp_expired");
    expect(authErrorMessage(error, action)).toBe("El código no es válido o venció");
  });

  test("RF-57: the same password as before", () => {
    const error = new AuthApiError("New password should be different from the old password.", 422, "same_password");
    expect(authErrorMessage(error, "reset")).toBe("Elegí una contraseña distinta de la anterior");
  });

  test.each(["sign-up", "resend", "recover"] as const)("RF-61: too many emails on %s", (action) => {
    const error = new AuthApiError("email rate limit exceeded", 429, "over_email_send_rate_limit");
    expect(authErrorMessage(error, action)).toBe("Mandamos demasiados emails. Esperá unos minutos y probá de nuevo");
  });

  test.each([
    ["confirm", "No pudimos confirmar tu email. Intentá de nuevo"],
    ["resend", "No pudimos reenviar el código. Intentá de nuevo"],
    ["recover", "No pudimos enviar el código. Intentá de nuevo"],
    ["reset", "No pudimos cambiar tu contraseña. Intentá de nuevo"],
    ["google", "No pudimos iniciar sesión con Google. Probá de nuevo"],
  ] as const)("RF-49 and the rest: any other error on %s", (action, message) => {
    const error = new AuthApiError("Internal error", 500, "unexpected_failure");
    expect(authErrorMessage(error, action)).toBe(message);
  });
});

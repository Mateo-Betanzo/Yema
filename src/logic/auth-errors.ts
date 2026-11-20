// Turns a Supabase Auth error into the message the user sees (spec 002: RF-12, RF-15, RF-18, RF-19, and
// since the change of 2026-11-19 RF-41, RF-49, RF-56, RF-57 and RF-61). Codes verified against local
// Supabase (plan 002).
import { isAuthApiError, isAuthRetryableFetchError } from "@supabase/supabase-js";

import { NO_CONNECTION } from "./form-rules";

export type AuthAction = "sign-up" | "sign-in" | "confirm" | "resend" | "recover" | "reset" | "google";

const FALLBACK: Record<AuthAction, string> = {
  "sign-up": "No pudimos crear tu cuenta. Intentá de nuevo",
  "sign-in": "No pudimos iniciar sesión. Intentá de nuevo",
  confirm: "No pudimos confirmar tu email. Intentá de nuevo",
  resend: "No pudimos reenviar el código. Intentá de nuevo",
  recover: "No pudimos enviar el código. Intentá de nuevo",
  reset: "No pudimos cambiar tu contraseña. Intentá de nuevo",
  // RF-49.
  google: "No pudimos iniciar sesión con Google. Probá de nuevo",
};

/** RF-12: also for an account that was never confirmed; the recovery lets the owner keep it. */
export const ALREADY_REGISTERED = "Ese email ya está registrado. Si es tuyo, usá ¿Olvidaste tu contraseña?";

const BY_CODE: Record<string, string> = {
  user_already_exists: ALREADY_REGISTERED,
  // RF-18: the same message for a wrong email and a wrong password: it must not tell which one failed.
  invalid_credentials: "Email o contraseña incorrectos",
  // RF-41, RF-56: the server answers the same for a wrong code and an expired one.
  otp_expired: "El código no es válido o venció",
  // RF-57.
  same_password: "Elegí una contraseña distinta de la anterior",
  // RF-61.
  over_email_send_rate_limit: "Mandamos demasiados emails. Esperá unos minutos y probá de nuevo",
};

/** RF-46: Google signs in only to an account that already exists. */
export const NO_ACCOUNT_FOR_GOOGLE = "No hay una cuenta con ese email. Primero creá tu cuenta";

export function authErrorMessage(error: unknown, action: AuthAction): string {
  // supabase-js raises AuthRetryableFetchError with status 0 when the request never reaches the server,
  // but also with the 5xx status when the server fails (a profile that breaks a check gives 500).
  if (isAuthRetryableFetchError(error) && error.status === 0) {
    return NO_CONNECTION;
  }

  if (isAuthApiError(error) && error.code && Object.hasOwn(BY_CODE, error.code)) {
    return BY_CODE[error.code];
  }

  return FALLBACK[action];
}

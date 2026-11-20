// The steps of signing up, confirming and entering with Google that depend on what the Auth server
// answers (spec 002, change of 2026-11-19: RF-4, RF-12, RF-45, RF-46, RF-49, RF-60). The answers were
// verified against local Supabase with email confirmation on (plan 002).
import { isAuthApiError } from "@supabase/supabase-js";

/** The fields of the user that signUp returns which tell a new account from an existing one. */
type SignedUpUser = {
  identities?: readonly unknown[];
  created_at: string;
  confirmation_sent_at?: string;
};

export type SignUpOutcome = { kind: "confirm" } | { kind: "already-registered" } | { kind: "error"; error: unknown };

// A new account is created and emailed in the same request (milliseconds apart); an account that was
// never confirmed gets the code again at least max_frequency later (60 s in the cloud).
const NEW_ACCOUNT_WINDOW_MS = 5_000;

/** Supabase writes up to 9 decimals of a second; Date.parse is only sure with 3. */
function toMillis(iso: string): number {
  return Date.parse(iso.replace(/(\.\d{3})\d+/, "$1"));
}

/**
 * RF-4 and RF-12. A confirmed account comes back as user_already_exists (local) or as a fake user
 * without identities (cloud); one that was never confirmed comes back as the real, older user, with the
 * code sent again. Both are "already registered": the owner keeps the account by recovering the password.
 */
export function signUpOutcome({ user, error }: { user: SignedUpUser | null; error: unknown }): SignUpOutcome {
  if (isAuthApiError(error) && error.code === "user_already_exists") return { kind: "already-registered" };
  if (error || !user) return { kind: "error", error };
  if (user.identities?.length === 0) return { kind: "already-registered" };
  if (
    user.confirmation_sent_at &&
    toMillis(user.confirmation_sent_at) - toMillis(user.created_at) > NEW_ACCOUNT_WINDOW_MS
  ) {
    return { kind: "already-registered" };
  }
  return { kind: "confirm" };
}

/** RF-60: seconds between two emails with a code, as the interval per user of the cloud. */
export const RESEND_SECONDS = 60;

/** RF-60: whole seconds until "Reenviar código" can be used again; 0 when it already can. */
export function resendSecondsLeft(sentAt: number, now: number): number {
  return Math.max(0, Math.ceil((sentAt + RESEND_SECONDS * 1000 - now) / 1000));
}

export type AuthRedirect =
  | { kind: "tokens"; accessToken: string; refreshToken: string }
  | { kind: "no-account" }
  | { kind: "failed" };

/** "a=1&b=2" into its values, decoded ("+" is a space in a query). */
function parseParams(text: string): Record<string, string> {
  const params: Record<string, string> = {};
  for (const pair of text.split("&")) {
    if (pair === "") continue;
    const [key, ...rest] = pair.split("=");
    const decode = (value: string) => decodeURIComponent(value.replace(/\+/g, " "));
    params[decode(key)] = decode(rest.join("="));
  }
  return params;
}

/**
 * The URL Google's sign-in comes back to (RF-45, RF-46, RF-49). Supabase's implicit flow puts the
 * tokens in the fragment and the errors in both the query and the fragment. Google without an account
 * ends in the profile rejected by the database ("Database error saving new user"). null: nothing of Auth.
 */
export function parseAuthRedirect(url: string): AuthRedirect | null {
  const hashAt = url.indexOf("#");
  const beforeHash = hashAt === -1 ? url : url.slice(0, hashAt);
  const queryAt = beforeHash.indexOf("?");
  const params = {
    ...(queryAt === -1 ? {} : parseParams(beforeHash.slice(queryAt + 1))),
    ...(hashAt === -1 ? {} : parseParams(url.slice(hashAt + 1))),
  };

  if (params.error || params.error_description) {
    return params.error_description === "Database error saving new user" ? { kind: "no-account" } : { kind: "failed" };
  }
  if (params.access_token && params.refresh_token) {
    return { kind: "tokens", accessToken: params.access_token, refreshToken: params.refresh_token };
  }
  if (params.access_token || params.refresh_token) return { kind: "failed" };
  return null;
}

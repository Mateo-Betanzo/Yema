import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";

import { parseAuthRedirect, RESEND_SECONDS, resendSecondsLeft, signUpOutcome } from "@/logic/auth-flow";

// Answers of the Auth server, verified against local Supabase with email confirmation on (plan 002,
// change of 2026-11-19).
describe("signUpOutcome", () => {
  // A new account: created and emailed in the same request, milliseconds apart.
  const fresh = {
    identities: [{ id: "identity" }],
    created_at: "2026-11-20T01:31:45.97382Z",
    confirmation_sent_at: "2026-11-20T01:31:45.977648377Z",
  };

  test("RF-4: a new account goes to the code", () => {
    expect(signUpOutcome({ user: fresh, error: null })).toEqual({ kind: "confirm" });
  });

  test("RF-12: user_already_exists (a confirmed account, as local Supabase answers)", () => {
    const error = new AuthApiError("User already registered", 422, "user_already_exists");
    expect(signUpOutcome({ user: null, error })).toEqual({ kind: "already-registered" });
  });

  test("RF-12: a user without identities (a confirmed account, as the cloud may answer)", () => {
    expect(signUpOutcome({ user: { ...fresh, identities: [] }, error: null })).toEqual({ kind: "already-registered" });
  });

  test("RF-12: an account that was never confirmed: old, with the code just sent again", () => {
    // In the cloud the code can be sent again only 60 s after the last one (max_frequency).
    const repeated = {
      identities: [{ id: "identity" }],
      created_at: "2026-11-20T01:31:38.789109Z",
      confirmation_sent_at: "2026-11-20T01:32:39.337683224Z",
    };
    expect(signUpOutcome({ user: repeated, error: null })).toEqual({ kind: "already-registered" });
  });

  test("a repeat sign-up within 5 s counts as new (only possible locally, where max_frequency is 1 s)", () => {
    const quick = { ...fresh, created_at: "2026-11-20T01:31:38.789109Z", confirmation_sent_at: "2026-11-20T01:31:41.337683224Z" };
    expect(signUpOutcome({ user: quick, error: null })).toEqual({ kind: "confirm" });
  });

  test("up to 5 s between creation and email is still a new account", () => {
    const slow = { ...fresh, created_at: "2026-11-20T01:31:40.000Z", confirmation_sent_at: "2026-11-20T01:31:45.000Z" };
    expect(signUpOutcome({ user: slow, error: null })).toEqual({ kind: "confirm" });
  });

  test("without confirmation_sent_at it is a new account", () => {
    expect(signUpOutcome({ user: { ...fresh, confirmation_sent_at: undefined }, error: null })).toEqual({
      kind: "confirm",
    });
  });

  test.each([
    ["too many emails", new AuthApiError("email rate limit exceeded", 429, "over_email_send_rate_limit")],
    ["no connection", new AuthRetryableFetchError("fetch failed", 0)],
    ["a profile the database rejects", new AuthRetryableFetchError("Database error saving new user", 500)],
  ])("any other error is returned for its message (%s)", (_case, error) => {
    expect(signUpOutcome({ user: null, error })).toEqual({ kind: "error", error });
  });

  test("no user and no error is an error too", () => {
    expect(signUpOutcome({ user: null, error: null })).toEqual({ kind: "error", error: null });
  });
});

describe("resendSecondsLeft (RF-60)", () => {
  const sentAt = Date.UTC(2026, 10, 19, 22, 0, 0);

  test("waits 60 s after each email", () => {
    expect(RESEND_SECONDS).toBe(60);
    expect(resendSecondsLeft(sentAt, sentAt)).toBe(60);
  });

  test("counts whole seconds up", () => {
    expect(resendSecondsLeft(sentAt, sentAt + 1)).toBe(60);
    expect(resendSecondsLeft(sentAt, sentAt + 59_001)).toBe(1);
  });

  test("0 when the time is over, never negative", () => {
    expect(resendSecondsLeft(sentAt, sentAt + 60_000)).toBe(0);
    expect(resendSecondsLeft(sentAt, sentAt + 600_000)).toBe(0);
  });
});

describe("parseAuthRedirect (RF-45, RF-46, RF-49)", () => {
  const base = "exp://192.168.0.10:8081/--/login";

  test("RF-45: the tokens of the implicit flow arrive in the fragment", () => {
    const url = `${base}#access_token=eyJ.a-b_c&expires_in=3600&refresh_token=r3fr35h&token_type=bearer&type=signup`;
    expect(parseAuthRedirect(url)).toEqual({ kind: "tokens", accessToken: "eyJ.a-b_c", refreshToken: "r3fr35h" });
  });

  test("values are decoded", () => {
    expect(parseAuthRedirect(`${base}#access_token=a%2Bb&refresh_token=c%3Dd`)).toEqual({
      kind: "tokens",
      accessToken: "a+b",
      refreshToken: "c=d",
    });
  });

  test("RF-46: Google without an account (the profile is rejected and the server says so)", () => {
    const url = `${base}?error=server_error&error_code=unexpected_failure&error_description=Database+error+saving+new+user#error=server_error&error_code=unexpected_failure&error_description=Database+error+saving+new+user&sb=`;
    expect(parseAuthRedirect(url)).toEqual({ kind: "no-account" });
  });

  test("RF-46: also when the error comes only in the query, encoded with %20", () => {
    expect(parseAuthRedirect(`${base}?error=server_error&error_description=Database%20error%20saving%20new%20user`)).toEqual({
      kind: "no-account",
    });
  });

  test("RF-49: any other error", () => {
    expect(parseAuthRedirect(`${base}#error=access_denied&error_description=Unverified+email`)).toEqual({ kind: "failed" });
  });

  test("RF-49: tokens without the refresh token are not enough", () => {
    expect(parseAuthRedirect(`${base}#access_token=eyJ`)).toEqual({ kind: "failed" });
  });

  test.each([base, `${base}?`, `${base}#`, `${base}?foo=bar`])("null when there is nothing of Auth (%p)", (url) => {
    expect(parseAuthRedirect(url)).toBeNull();
  });
});

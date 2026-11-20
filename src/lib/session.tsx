// Who is using the app and with which role (spec 002: RF-17, RF-21 to RF-24). Spec 010 (RF-25):
// setProfile puts in the session the profile the client just saved, so the Perfil, the greeting of
// the Home and the checkout show it without reading the session again.
import type { Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import type { Tables } from "./database.types";
import { clearDailySummary } from "./daily-summary";
import { supabase } from "./supabase";

export type Profile = Tables<"profiles">;
export type SessionStatus = "loading" | "signed-out" | "client" | "admin";

type SessionState = { status: SessionStatus; profile: Profile | null; email: string | null };
type SessionContextValue = SessionState & {
  signOut: () => Promise<void>;
  /** Replaces the profile of the open session (the role never changes this way); without one, nothing. */
  setProfile: (profile: Profile) => void;
};

const LOADING: SessionState = { status: "loading", profile: null, email: null };
const SIGNED_OUT: SessionState = { status: "signed-out", profile: null, email: null };

const SessionContext = createContext<SessionContextValue | null>(null);

// RF-22: "local" removes the session from this phone first, so signing out never depends on the
// network; Supabase then revokes that session on the server if it can. Spec 012, RF-17: the summary of the
// day of the admin goes too, so nothing of the business stays on the phone.
async function signOut() {
  clearDailySummary();
  await supabase.auth.signOut({ scope: "local" });
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>(LOADING);

  useEffect(() => {
    // Each change of session gets a number: a profile that arrives after a newer change is ignored.
    let latest = 0;

    async function resolve(session: Session | null) {
      const request = ++latest;
      if (!session) {
        setState(SIGNED_OUT);
        return;
      }
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .single();
      if (request !== latest) return;
      if (error || !profile) {
        // RF-23: a session whose profile cannot be read is not valid; close it on this device only.
        await supabase.auth.signOut({ scope: "local" });
        setState(SIGNED_OUT);
        return;
      }
      setState({ status: profile.role, profile, email: session.user.email ?? null });
    }

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      // RF-24: the role is read when the app opens (INITIAL_SESSION) and on sign-in; a token refresh
      // keeps it. Change of 2026-11-19, RF-54: a verified recovery code (PASSWORD_RECOVERY) does not
      // enter yet; saving the new password (USER_UPDATED) does.
      if (event !== "INITIAL_SESSION" && event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") {
        return;
      }
      // Supabase warns against calling the client inside this callback (it can deadlock): defer it.
      setTimeout(() => void resolve(session), 0);
    });

    return () => {
      latest++;
      data.subscription.unsubscribe();
    };
  }, []);

  function setProfile(profile: Profile) {
    setState((current) => (current.profile ? { ...current, profile } : current));
  }

  return <SessionContext.Provider value={{ ...state, signOut, setProfile }}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside a <SessionProvider />");
  return value;
}

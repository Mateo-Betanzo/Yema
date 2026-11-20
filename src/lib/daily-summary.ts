// The "Resumen del día" of the admin Dashboard (spec 012: RF-12 to RF-15, RF-17 to RF-22). The summary is
// kept on the phone (expo-sqlite's localStorage, as the session) with its Buenos Aires day; which card to
// show comes from summaryCardState with "now", which is taken again when the screen gains focus and when
// the app comes to the foreground. It is made once per day from 21 h, by the Edge Function daily-summary
// (the AI key lives there), and again when the admin pulls the Dashboard down from 21 h.
import { useMutation } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import { summaryCardState, trimSummary, type DailyFacts, type StoredSummary } from "@/logic/daily-summary";
import { toBuenosAiresDate } from "@/logic/dates";

import { supabase } from "./supabase";

const KEY = "yema.daily-summary";

export type DailySummaryCard =
  | { kind: "today" | "yesterday"; text: string; updating: boolean; updateFailed: boolean }
  | { kind: "waiting" }
  | { kind: "loading" }
  | { kind: "error" };

type Status = "idle" | "making" | "failed";

function readStored(): StoredSummary | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (typeof value !== "object" || value === null) return null;
    const { date, text } = value as Record<string, unknown>;
    return typeof date === "string" && typeof text === "string" ? { date, text } : null;
  } catch {
    return null;
  }
}

function writeStored(summary: StoredSummary) {
  try {
    localStorage.setItem(KEY, JSON.stringify(summary));
  } catch {
    // Without storage it is shown anyway; it will be made again next time.
  }
}

/** RF-17: what signOut calls, so nothing of the business stays on the phone. */
export function clearDailySummary() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing kept, nothing to remove.
  }
}

/** The summary of the day for the card, and how to make it again (pulling down) or retry. */
export function useDailySummary(facts: DailyFacts | null): {
  card: DailySummaryCard;
  refresh: () => void;
  retry: () => void;
} {
  const [stored, setStored] = useState<StoredSummary | null>(readStored);
  const [now, setNow] = useState(() => new Date());
  // A ref, because two calls can arrive before the mutation reports that it is pending.
  const making = useRef(false);
  const state = summaryCardState(stored, now);

  const mutation = useMutation({
    mutationFn: async (input: DailyFacts) => {
      const { data, error } = await supabase.functions.invoke("daily-summary", { body: input });
      if (error) throw error;
      const summary = (data as { summary?: unknown } | null)?.summary;
      // RF-4: only the complete sentences that fit; nothing that fits is an error.
      const text = trimSummary(typeof summary === "string" ? summary : "");
      if (!text) throw new Error("empty summary");
      return text;
    },
    onSuccess: (text) => {
      const made = new Date();
      const next = { date: toBuenosAiresDate(made), text };
      writeStored(next);
      setStored(next);
      setNow(made);
    },
    onSettled: () => {
      making.current = false;
    },
  });
  const { mutate } = mutation;
  const status: Status = mutation.isPending ? "making" : mutation.isError ? "failed" : "idle";

  const make = useCallback(() => {
    if (making.current || !facts) return;
    making.current = true;
    mutate(facts);
  }, [facts, mutate]);

  // RF-12: from 21 h, without that day's summary, it is made by itself, once (a failure waits for Reintentar).
  useEffect(() => {
    if (state.kind === "due" && facts && status === "idle") make();
  }, [state.kind, facts, status, make]);

  // "Now" again when the screen gains focus and when the app comes to the foreground: 21 h or midnight
  // may have passed (spec, casos límite).
  useFocusEffect(useCallback(() => setNow(new Date()), []));
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (appState) => {
      if (appState === "active") setNow(new Date());
    });
    return () => subscription.remove();
  }, []);

  // RF-15: pulling down makes it again only from 21 h; before, the card stays.
  const refresh = useCallback(() => {
    const current = new Date();
    setNow(current);
    const kind = summaryCardState(readStored(), current).kind;
    if (kind === "today" || kind === "due") make();
  }, [make]);

  return { card: toCard(state, status), refresh, retry: make };
}

function toCard(state: ReturnType<typeof summaryCardState>, status: Status): DailySummaryCard {
  if (state.kind === "today" || state.kind === "yesterday") {
    // RF-19, RF-21: making it again keeps the previous one on the screen.
    return { kind: state.kind, text: state.text, updating: status === "making", updateFailed: status === "failed" };
  }
  if (state.kind === "waiting") return { kind: "waiting" };
  // RF-18, RF-20: the first one of the day, being made or failed.
  return status === "failed" ? { kind: "error" } : { kind: "loading" };
}

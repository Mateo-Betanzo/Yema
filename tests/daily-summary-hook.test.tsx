import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook as render, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";

import { clearDailySummary, useDailySummary } from "@/lib/daily-summary";
import type { DailyFacts } from "@/logic/daily-summary";

// Spec 012 · T3: when the "Resumen del día" is made, what is kept on the phone and what the card shows
// meanwhile (RF-12 to RF-15, RF-17, RF-19, RF-21, RF-22). The Edge Function (supabase.functions.invoke),
// the phone storage (localStorage of expo-sqlite) and the focus of the screen (useFocusEffect) are
// replaced. Only Date is faked: Buenos Aires is UTC−3, so 21:00 there is 00:00 UTC of the next day.
const KEY = "yema.daily-summary";
const FACTS: DailyFacts = {
  incomeToday: "$63.000",
  deliveredToday: 6,
  toDeliver: 3,
  bestSellersWeek: ["Grandes"],
  lowStock: [],
  shortfalls: [],
};
const BEFORE_CLOSING = new Date("2026-11-19T15:00:00Z"); // Thursday 12:00
const AFTER_CLOSING = new Date("2026-11-20T00:30:00Z"); // Thursday 21:30

const mockStore = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => mockStore.get(key) ?? null,
    setItem: (key: string, value: string) => void mockStore.set(key, value),
    removeItem: (key: string) => void mockStore.delete(key),
  },
});

type Invoke = jest.Mock<Promise<{ data: unknown; error: unknown }>, [string, { body: unknown }]>;
const mockInvoke: Invoke = jest.fn();
jest.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: (...args: [string, { body: unknown }]) => mockInvoke(...args) } } }));

let mockFocus: (() => void) | null = null;
jest.mock("expo-router", () => ({
  useFocusEffect: (effect: () => void) => {
    mockFocus = effect;
  },
}));

const answer = (summary: string) => Promise.resolve({ data: { summary }, error: null });
const failure = () => Promise.resolve({ data: null, error: new Error("FunctionsHttpError") });
const store = (date: string, text: string) => mockStore.set(KEY, JSON.stringify({ date, text }));
const stored = () => JSON.parse(mockStore.get(KEY) ?? "null");

beforeAll(() => {
  jest.useFakeTimers({
    doNotFake: [
      "hrtime",
      "nextTick",
      "performance",
      "queueMicrotask",
      "requestAnimationFrame",
      "cancelAnimationFrame",
      "requestIdleCallback",
      "cancelIdleCallback",
      "setImmediate",
      "clearImmediate",
      "setInterval",
      "clearInterval",
      "setTimeout",
      "clearTimeout",
    ],
  });
});
afterAll(() => jest.useRealTimers());
afterEach(() => client.clear());

let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
// The hook inside the app's QueryClient (useMutation); gcTime Infinity schedules no timers.
const renderHook: typeof render = ((hook: never, options?: Record<string, unknown>) =>
  render(hook, { ...options, wrapper })) as typeof render;

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { mutations: { retry: false, gcTime: Infinity } } });
  mockStore.clear();
  mockInvoke.mockReset();
  mockFocus = null;
});

describe("useDailySummary · from 21 h (RF-12, RF-13)", () => {
  beforeEach(() => jest.setSystemTime(AFTER_CLOSING));

  test("RF-12: without today's, it makes it once, keeps it with its day and shows it", async () => {
    mockInvoke.mockImplementation(() => answer("Se entregaron 6 pedidos. Quedaron 3."));
    const { result, rerender } = await renderHook(() => useDailySummary(FACTS));
    await waitFor(() => expect(result.current.card).toEqual({ kind: "today", text: "Se entregaron 6 pedidos. Quedaron 3.", updating: false, updateFailed: false }));
    await rerender({});
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenCalledWith("daily-summary", { body: FACTS });
    expect(stored()).toEqual({ date: "2026-11-19", text: "Se entregaron 6 pedidos. Quedaron 3." });
  });

  test("RF-18: while it is being made for the first time, the card is loading", async () => {
    let finish: (value: { data: unknown; error: unknown }) => void = () => {};
    mockInvoke.mockImplementation(() => new Promise((resolve) => (finish = resolve)));
    const { result } = await renderHook(() => useDailySummary(FACTS));
    await waitFor(() => expect(result.current.card).toEqual({ kind: "loading" }));
    await act(async () => finish({ data: { summary: "Listo." }, error: null }));
    expect(result.current.card).toMatchObject({ kind: "today", text: "Listo." });
  });

  test("RF-13: with today's kept, it shows it without asking again", async () => {
    store("2026-11-19", "Del jueves.");
    const { result } = await renderHook(() => useDailySummary(FACTS));
    expect(result.current.card).toEqual({ kind: "today", text: "Del jueves.", updating: false, updateFailed: false });
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  test("RF-12: it waits for the facts of the day before asking", async () => {
    mockInvoke.mockImplementation(() => answer("Listo."));
    const { result, rerender } = await renderHook(({ facts }: { facts: DailyFacts | null }) => useDailySummary(facts), {
      initialProps: { facts: null as DailyFacts | null },
    });
    expect(result.current.card).toEqual({ kind: "loading" });
    expect(mockInvoke).not.toHaveBeenCalled();
    await rerender({ facts: FACTS });
    await waitFor(() => expect(result.current.card).toMatchObject({ kind: "today", text: "Listo." }));
  });

  test("RF-4, RF-20: an answer that does not fit is an error, and nothing is kept", async () => {
    mockInvoke.mockImplementation(() => answer(`${"a".repeat(400)}.`));
    const { result } = await renderHook(() => useDailySummary(FACTS));
    await waitFor(() => expect(result.current.card).toEqual({ kind: "error" }));
    expect(stored()).toBeNull();
  });

  test("RF-20, RF-22: when it fails it says so and does not insist; Reintentar asks again", async () => {
    mockInvoke.mockImplementationOnce(failure).mockImplementationOnce(() => answer("Ahora sí."));
    const { result, rerender } = await renderHook(() => useDailySummary(FACTS));
    await waitFor(() => expect(result.current.card).toEqual({ kind: "error" }));
    await rerender({});
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    await act(async () => result.current.retry());
    await waitFor(() => expect(result.current.card).toMatchObject({ kind: "today", text: "Ahora sí." }));
    expect(mockInvoke).toHaveBeenCalledTimes(2);
  });
});

describe("useDailySummary · pulling it down (RF-15, RF-19, RF-21)", () => {
  test("RF-15, RF-19: from 21 h it makes it again, with the previous one on the screen meanwhile", async () => {
    jest.setSystemTime(AFTER_CLOSING);
    store("2026-11-19", "El anterior.");
    let finish: (value: { data: unknown; error: unknown }) => void = () => {};
    mockInvoke.mockImplementation(() => new Promise((resolve) => (finish = resolve)));
    const { result } = await renderHook(() => useDailySummary(FACTS));
    await act(async () => result.current.refresh());
    expect(result.current.card).toEqual({ kind: "today", text: "El anterior.", updating: true, updateFailed: false });
    await act(async () => finish({ data: { summary: "El nuevo." }, error: null }));
    expect(result.current.card).toEqual({ kind: "today", text: "El nuevo.", updating: false, updateFailed: false });
    expect(stored()).toEqual({ date: "2026-11-19", text: "El nuevo." });
  });

  test("RF-21: when making it again fails, the previous one stays with the error", async () => {
    jest.setSystemTime(AFTER_CLOSING);
    store("2026-11-19", "El anterior.");
    mockInvoke.mockImplementation(failure);
    const { result } = await renderHook(() => useDailySummary(FACTS));
    await act(async () => result.current.refresh());
    await waitFor(() =>
      expect(result.current.card).toEqual({ kind: "today", text: "El anterior.", updating: false, updateFailed: true }),
    );
    expect(stored()).toEqual({ date: "2026-11-19", text: "El anterior." });
  });

  test("two quick pulls make one summary", async () => {
    jest.setSystemTime(AFTER_CLOSING);
    store("2026-11-19", "El anterior.");
    mockInvoke.mockImplementation(() => new Promise(() => {}));
    const { result } = await renderHook(() => useDailySummary(FACTS));
    await act(async () => {
      result.current.refresh();
      result.current.refresh();
    });
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  test("RF-15: before 21 h, pulling it down does not touch the card", async () => {
    jest.setSystemTime(BEFORE_CLOSING);
    store("2026-11-18", "Del miércoles.");
    const { result } = await renderHook(() => useDailySummary(FACTS));
    await act(async () => result.current.refresh());
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(result.current.card).toEqual({ kind: "yesterday", text: "Del miércoles.", updating: false, updateFailed: false });
  });
});

describe("useDailySummary · before 21 h (RF-14)", () => {
  beforeEach(() => jest.setSystemTime(BEFORE_CLOSING));

  test("RF-14: yesterday's summary, without asking", async () => {
    store("2026-11-18", "Del miércoles.");
    const { result } = await renderHook(() => useDailySummary(FACTS));
    expect(result.current.card).toEqual({ kind: "yesterday", text: "Del miércoles.", updating: false, updateFailed: false });
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  test("RF-14: without yesterday's, the notice", async () => {
    const { result } = await renderHook(() => useDailySummary(FACTS));
    expect(result.current.card).toEqual({ kind: "waiting" });
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  test("RF-12: when the screen gains focus again past 21 h, it is made", async () => {
    store("2026-11-18", "Del miércoles.");
    mockInvoke.mockImplementation(() => answer("Del jueves."));
    const { result } = await renderHook(() => useDailySummary(FACTS));
    expect(result.current.card).toMatchObject({ kind: "yesterday" });
    jest.setSystemTime(AFTER_CLOSING);
    await act(async () => mockFocus?.());
    await waitFor(() => expect(result.current.card).toMatchObject({ kind: "today", text: "Del jueves." }));
  });

  test("a stored value that is not a summary is ignored", async () => {
    mockStore.set(KEY, "{not json");
    const { result } = await renderHook(() => useDailySummary(FACTS));
    expect(result.current.card).toEqual({ kind: "waiting" });
  });
});

describe("clearDailySummary (RF-17)", () => {
  test("removes the summary kept on the phone", () => {
    store("2026-11-19", "Del jueves.");
    clearDailySummary();
    expect(stored()).toBeNull();
  });
});

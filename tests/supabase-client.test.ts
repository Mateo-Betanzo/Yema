import { AppState, type AppStateStatus } from "react-native";

// Spec 002 · T4 (RF-21, RF-23): the Supabase client, as in the Supabase quickstart for Expo.
// createClient is replaced with a recorder: what matters is how the app configures it.
// expo-sqlite needs its native module, which Jest does not have: its localStorage is replaced with
// an in-memory one (persistence across restarts is checked in Expo Go, RF-21).
const mockAuth = { startAutoRefresh: jest.fn(), stopAutoRefresh: jest.fn() };
const mockCreateClient = jest.fn((_url: string, _key: string, _options: unknown) => ({ auth: mockAuth }));

jest.mock("@supabase/supabase-js", () => ({
  createClient: (url: string, key: string, options: unknown) => mockCreateClient(url, key, options),
}));

jest.mock("expo-sqlite/localStorage/install", () => {
  const values = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  } as Storage;
});

const URL = "http://192.168.0.10:54321";
const KEY = "sb_publishable_test";

function loadClient() {
  let loaded: typeof import("@/lib/supabase") | undefined;
  jest.isolateModules(() => {
    loaded = jest.requireActual<typeof import("@/lib/supabase")>("@/lib/supabase");
  });
  return loaded!;
}

describe("supabase client", () => {
  const addEventListener = jest.spyOn(AppState, "addEventListener");

  // Babel turns process.env.EXPO_PUBLIC_* into expo/virtual/env, which keeps a reference to
  // process.env: the variables are changed on that same object, never by replacing it.
  beforeEach(() => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = URL;
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = KEY;
    jest.clearAllMocks();
  });

  afterAll(() => {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    delete process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  });

  test("uses the URL and the publishable key from the environment", () => {
    const { supabase } = loadClient();
    expect(mockCreateClient).toHaveBeenCalledWith(URL, KEY, expect.anything());
    expect(supabase.auth).toBe(mockAuth);
  });

  test("RF-21: keeps the session on the device and refreshes it", () => {
    loadClient();
    const options = mockCreateClient.mock.calls[0][2];
    expect(options).toEqual({
      auth: {
        storage: localStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  });

  test("RF-23: refreshes the token only while the app is in the foreground", () => {
    loadClient();
    expect(addEventListener).toHaveBeenCalledTimes(1);
    const onChange = addEventListener.mock.calls[0][1] as (state: AppStateStatus) => void;

    onChange("active");
    expect(mockAuth.startAutoRefresh).toHaveBeenCalledTimes(1);

    onChange("background");
    expect(mockAuth.stopAutoRefresh).toHaveBeenCalledTimes(1);
  });

  test("fails with a clear message when the environment is not configured", () => {
    delete process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    expect(loadClient).toThrow(/\.env\.local/);
  });
});

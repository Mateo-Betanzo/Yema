import { render } from "@testing-library/react-native";
import type { ReactElement, ReactNode } from "react";
import { Appearance } from "react-native";

import type { SessionStatus } from "@/lib/session";

// The navigator, the status bar and the splash screen need a native host, so they are replaced with
// recorders: what matters here is which props the root layout gives them. The session is mocked too,
// so each test chooses its state.
type ProtectedProps = { guard: boolean; children: ReactElement<{ name: string }> };

const mockStack = jest.fn((_props: unknown) => null);
const mockProtected = jest.fn((_props: ProtectedProps) => null);
const mockStatusBar = jest.fn((_props: unknown) => null);
const mockSplash = { preventAutoHideAsync: jest.fn(), hide: jest.fn() };
let mockStatus: SessionStatus = "loading";

jest.mock("expo-router", () => {
  const Stack = (props: { children?: ReactNode }) => {
    mockStack(props);
    return props.children;
  };
  Stack.Screen = function Screen(_props: { name: string }) {
    return null;
  };
  Stack.Protected = function Protected(props: ProtectedProps) {
    return mockProtected(props);
  };
  return { Stack };
});
jest.mock("expo-status-bar", () => ({ StatusBar: (props: unknown) => mockStatusBar(props) }));
jest.mock("expo-splash-screen", () => mockSplash);
// Spec 002, RF-45 (bug of 2026-11-19): on web the popup of Google hands its answer to the app.
const mockCompleteGoogle = jest.fn();
jest.mock("@/lib/google-auth", () => ({ completeGoogleSignInOnWeb: () => mockCompleteGoogle() }));
jest.mock("@/lib/session", () => ({
  SessionProvider: ({ children }: { children: ReactNode }) => children,
  useSession: () => ({ status: mockStatus }),
}));

// Which route each guard lets through, as { name: guard }.
function guards(): Record<string, boolean> {
  const calls = mockProtected.mock.calls;
  const lastRender = calls.slice(-3);
  return Object.fromEntries(lastRender.map(([props]) => [props.children.props.name, props.guard]));
}

describe("root layout (spec 001 RF-1, spec 002)", () => {
  const setColorScheme = jest.spyOn(Appearance, "setColorScheme").mockImplementation(() => {});
  let RootLayout: () => React.JSX.Element;

  beforeAll(() => {
    // Loaded after the spy exists (a static import would run first): the dark scheme is set when
    // the module loads, not on each render. Jest cannot use dynamic import() without a flag.
    RootLayout = jest.requireActual<typeof import("@/app/_layout")>("@/app/_layout").default;
  });

  beforeEach(() => {
    mockStack.mockClear();
    mockProtected.mockClear();
    mockSplash.hide.mockClear();
  });

  test("forces the dark color scheme when it loads", () => {
    expect(setColorScheme).toHaveBeenCalledWith("dark");
  });

  test("spec 002, RF-45: lets the popup of Google finish when the app loads (it does nothing off the web)", () => {
    expect(mockCompleteGoogle).toHaveBeenCalledTimes(1);
  });

  test("keeps the splash screen up from the start", () => {
    expect(mockSplash.preventAutoHideAsync).toHaveBeenCalledTimes(1);
  });

  test("shows light status bar icons, not `auto`", async () => {
    await render(<RootLayout />);
    expect(mockStatusBar).toHaveBeenCalledWith(expect.objectContaining({ style: "light" }));
  });

  test("gives every screen of the stack the #121116 background and no header", async () => {
    await render(<RootLayout />);
    expect(mockStack).toHaveBeenCalledWith(
      expect.objectContaining({
        screenOptions: { headerShown: false, contentStyle: { backgroundColor: "#121116" } },
      }),
    );
  });

  test("while the session loads, keeps the splash and opens no group", async () => {
    mockStatus = "loading";
    await render(<RootLayout />);
    expect(mockSplash.hide).not.toHaveBeenCalled();
    expect(guards()).toEqual({ "(auth)": false, client: false, admin: false });
  });

  test("RF-1: signed out, only the auth screens are open", async () => {
    mockStatus = "signed-out";
    await render(<RootLayout />);
    expect(mockSplash.hide).toHaveBeenCalled();
    expect(guards()).toEqual({ "(auth)": true, client: false, admin: false });
  });

  test("RF-21 / RF-25: a client opens only the client screens", async () => {
    mockStatus = "client";
    await render(<RootLayout />);
    expect(mockSplash.hide).toHaveBeenCalled();
    expect(guards()).toEqual({ "(auth)": false, client: true, admin: false });
  });

  test("RF-21 / RF-26: the admin opens only the admin screens", async () => {
    mockStatus = "admin";
    await render(<RootLayout />);
    expect(mockSplash.hide).toHaveBeenCalled();
    expect(guards()).toEqual({ "(auth)": false, client: false, admin: true });
  });
});

describe("root layout on web (Expo CLI loads the routes in Node with react-native-web)", () => {
  // react-native-web has no Appearance.setColorScheme, so calling it there throws while the dev
  // server starts. The web build does not need it: only native elements (alerts, pickers) do.
  test("does not call Appearance.setColorScheme when Platform.OS is web", () => {
    let calls = -1;
    jest.isolateModules(() => {
      const rn = jest.requireActual<typeof import("react-native")>("react-native");
      jest.replaceProperty(rn.Platform, "OS", "web");
      const spy = jest.spyOn(rn.Appearance, "setColorScheme").mockImplementation(() => {});
      jest.requireActual("@/app/_layout");
      calls = spy.mock.calls.length;
    });
    expect(calls).toBe(0);
  });
});

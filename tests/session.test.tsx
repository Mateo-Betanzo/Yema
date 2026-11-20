import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";

import { SessionProvider, useSession } from "@/lib/session";

// Spec 002 · T6: the session and the role (RF-17, RF-21 to RF-24).
// The Supabase client is replaced with a fake that lets each test emit auth events and choose what
// the profile query answers.
type Listener = (event: string, session: unknown) => void;
type QueryResult = { data: unknown; error: unknown };

let mockListeners: Listener[] = [];
let mockProfileResult: QueryResult = { data: null, error: null };
const mockUnsubscribe = jest.fn();

const mockAuth = {
  signOut: jest.fn(async (_options?: unknown) => ({ error: null })),
  onAuthStateChange: jest.fn((listener: Listener) => {
    mockListeners.push(listener);
    return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
  }),
};
const mockProfileQuery = { single: jest.fn(async (): Promise<QueryResult> => mockProfileResult) };
const mockEq = jest.fn((_column: string, _value: string) => ({ single: mockProfileQuery.single }));
const mockFrom = jest.fn((_table: string) => ({ select: () => ({ eq: mockEq }) }));

// A getter, because the import of @/lib/session runs before mockAuth is initialized.
const mockClearDailySummary = jest.fn();
jest.mock("@/lib/daily-summary", () => ({ clearDailySummary: () => mockClearDailySummary() }));
jest.mock("@/lib/supabase", () => ({
  supabase: {
    get auth() {
      return mockAuth;
    },
    from: (table: string) => mockFrom(table),
  },
}));

const ANA = {
  id: "00000000-0000-0000-0000-0000000000a1",
  first_name: "Ana",
  last_name: "Pérez",
  phone: "1133445566",
  address: "Av. Rivadavia 4521",
  address_notes: null,
  role: "client",
};
const sessionOf = (id: string, email: string) => ({ user: { id, email } });

function emit(event: string, session: unknown) {
  for (const listener of mockListeners) listener(event, session);
}

function Probe() {
  const { status, profile, email } = useSession();
  return (
    <>
      <Text testID="status">{status}</Text>
      <Text testID="name">{profile?.first_name ?? ""}</Text>
      <Text testID="email">{email ?? ""}</Text>
    </>
  );
}

async function renderProvider() {
  return render(
    <SessionProvider>
      <Probe />
    </SessionProvider>,
  );
}

async function expectStatus(status: string) {
  await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent(status));
}

beforeEach(() => {
  mockListeners = [];
  mockProfileResult = { data: ANA, error: null };
  jest.clearAllMocks();
});

describe("SessionProvider", () => {
  test("is loading until Supabase reports the stored session", async () => {
    await renderProvider();
    expect(screen.getByTestId("status")).toHaveTextContent("loading");
  });

  test("RF-1: without a stored session, the user is signed out", async () => {
    await renderProvider();
    await act(async () => emit("INITIAL_SESSION", null));
    await expectStatus("signed-out");
    expect(mockFrom).not.toHaveBeenCalled();
  });

  test("RF-21: with a stored session, reads the profile and enters as a client", async () => {
    await renderProvider();
    await act(async () => emit("INITIAL_SESSION", sessionOf(ANA.id, "ana@example.com")));
    await expectStatus("client");
    expect(mockFrom).toHaveBeenCalledWith("profiles");
    expect(mockEq).toHaveBeenCalledWith("id", ANA.id);
    expect(screen.getByTestId("name")).toHaveTextContent("Ana");
    expect(screen.getByTestId("email")).toHaveTextContent("ana@example.com");
  });

  test("RF-21: the admin enters with the admin role", async () => {
    mockProfileResult = { data: { ...ANA, role: "admin" }, error: null };
    await renderProvider();
    await act(async () => emit("INITIAL_SESSION", sessionOf(ANA.id, "admin@example.com")));
    await expectStatus("admin");
  });

  test("RF-17 / RF-4: signing in reads the profile and enters with its role", async () => {
    await renderProvider();
    await act(async () => emit("INITIAL_SESSION", null));
    await expectStatus("signed-out");

    await act(async () => emit("SIGNED_IN", sessionOf(ANA.id, "ana@example.com")));
    await expectStatus("client");
  });

  test("RF-23: if the profile cannot be read, the session is closed on the device", async () => {
    mockProfileResult = { data: null, error: { message: "JWT expired" } };
    await renderProvider();
    await act(async () => emit("INITIAL_SESSION", sessionOf(ANA.id, "ana@example.com")));
    await expectStatus("signed-out");
    expect(mockAuth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  test("RF-22 / RF-23: when Supabase signs the user out, the user is signed out", async () => {
    await renderProvider();
    await act(async () => emit("INITIAL_SESSION", sessionOf(ANA.id, "ana@example.com")));
    await expectStatus("client");

    await act(async () => emit("SIGNED_OUT", null));
    await expectStatus("signed-out");
    expect(screen.getByTestId("name")).toHaveTextContent("");
  });

  test("RF-24: a token refresh keeps the role; a new role applies on the next app open", async () => {
    await renderProvider();
    await act(async () => emit("INITIAL_SESSION", sessionOf(ANA.id, "ana@example.com")));
    await expectStatus("client");

    mockProfileResult = { data: { ...ANA, role: "admin" }, error: null };
    await act(async () => emit("TOKEN_REFRESHED", sessionOf(ANA.id, "ana@example.com")));
    expect(mockFrom).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("status")).toHaveTextContent("client");
  });

  // Change of 2026-11-19, RF-54: verifying the recovery code opens a session (PASSWORD_RECOVERY) but
  // the app waits for the new password; saving it (USER_UPDATED) enters with the role.
  test("RF-54: a verified recovery code does not enter yet", async () => {
    await renderProvider();
    await act(async () => emit("INITIAL_SESSION", null));
    await expectStatus("signed-out");

    await act(async () => emit("PASSWORD_RECOVERY", sessionOf(ANA.id, "ana@example.com")));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
    expect(screen.getByTestId("status")).toHaveTextContent("signed-out");
    expect(mockFrom).not.toHaveBeenCalled();
  });

  test("RF-54: saving the new password enters with the role", async () => {
    await renderProvider();
    await act(async () => emit("INITIAL_SESSION", null));
    await act(async () => emit("PASSWORD_RECOVERY", sessionOf(ANA.id, "ana@example.com")));
    await act(async () => emit("USER_UPDATED", sessionOf(ANA.id, "ana@example.com")));
    await expectStatus("client");
    expect(screen.getByTestId("email")).toHaveTextContent("ana@example.com");
  });

  test("ignores a profile that arrives after the user already signed out", async () => {
    let answer: (value: QueryResult) => void = () => {};
    mockProfileQuery.single.mockImplementationOnce(
      () => new Promise<QueryResult>((resolve) => (answer = resolve)),
    );
    await renderProvider();
    await act(async () => emit("INITIAL_SESSION", sessionOf(ANA.id, "ana@example.com")));
    await waitFor(() => expect(mockProfileQuery.single).toHaveBeenCalled());
    await act(async () => emit("SIGNED_OUT", null));
    await expectStatus("signed-out");

    await act(async () => answer({ data: ANA, error: null }));
    expect(screen.getByTestId("status")).toHaveTextContent("signed-out");
  });

  test("RF-22: signOut closes the session through Supabase", async () => {
    function SignOutProbe() {
      const { signOut } = useSession();
      return <Text onPress={signOut}>Cerrar sesión</Text>;
    }
    await render(
      <SessionProvider>
        <SignOutProbe />
      </SessionProvider>,
    );
    await fireEvent.press(screen.getByText("Cerrar sesión"));
    expect(mockAuth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  test("spec 012, RF-17: signOut removes the summary of the day kept on the phone", async () => {
    function SignOutProbe() {
      const { signOut } = useSession();
      return <Text onPress={signOut}>Cerrar sesión</Text>;
    }
    await render(
      <SessionProvider>
        <SignOutProbe />
      </SessionProvider>,
    );
    await fireEvent.press(screen.getByText("Cerrar sesión"));
    expect(mockClearDailySummary).toHaveBeenCalledTimes(1);
  });

  // Spec 010 · T2, RF-25: the saved profile replaces the one of the session, without reading it again.
  test("spec 010, RF-25: setProfile replaces the profile and keeps the role and the email", async () => {
    function EditProbe() {
      const { setProfile } = useSession();
      return <Text onPress={() => setProfile({ ...ANA, first_name: "Anabel" } as never)}>Guardar</Text>;
    }
    await render(
      <SessionProvider>
        <Probe />
        <EditProbe />
      </SessionProvider>,
    );
    await act(async () => emit("INITIAL_SESSION", sessionOf(ANA.id, "ana@example.com")));
    await expectStatus("client");
    await fireEvent.press(screen.getByText("Guardar"));
    expect(screen.getByTestId("name")).toHaveTextContent("Anabel");
    expect(screen.getByTestId("status")).toHaveTextContent("client");
    expect(screen.getByTestId("email")).toHaveTextContent("ana@example.com");
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  test("spec 010: setProfile without a session does nothing", async () => {
    function EditProbe() {
      const { setProfile } = useSession();
      return <Text onPress={() => setProfile(ANA as never)}>Guardar</Text>;
    }
    await render(
      <SessionProvider>
        <Probe />
        <EditProbe />
      </SessionProvider>,
    );
    await act(async () => emit("INITIAL_SESSION", null));
    await expectStatus("signed-out");
    await fireEvent.press(screen.getByText("Guardar"));
    expect(screen.getByTestId("status")).toHaveTextContent("signed-out");
    expect(screen.getByTestId("name")).toHaveTextContent("");
  });

  test("stops listening to Supabase when it unmounts", async () => {
    const { unmount } = await renderProvider();
    await act(async () => unmount());
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });

  test("useSession outside the provider fails with a clear message", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    await expect(render(<Probe />)).rejects.toThrow(/SessionProvider/);
  });
});

import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import SignUp from "@/app/(auth)/sign-up";

// Spec 002 · T8: Sign-up (RF-2 to RF-15, RF-19, RF-20). Supabase and the router are replaced. Since
// the change of 2026-11-19 (T15) the new account goes to "Confirmá tu email" (RF-4) and an email that
// already has an account, confirmed or not, gets the message of RF-12.
type SignUpUser = { identities: unknown[]; created_at: string; confirmation_sent_at?: string };
type SignUpResult = { data: { user: SignUpUser | null; session: null }; error: unknown };

// As the server answers (plan 002): created and emailed in the same request.
const NEW_USER: SignUpUser = {
  identities: [{ id: "identity" }],
  created_at: "2026-11-20T01:31:45.97382Z",
  confirmation_sent_at: "2026-11-20T01:31:45.977648377Z",
};
const answerWith = (user: SignUpUser | null, error: unknown = null): SignUpResult => ({
  data: { user, session: null },
  error,
});
type SignUpCall = { email: string; password: string; options: { data: Record<string, unknown> } };

const mockSignUp = jest.fn(async (_call: SignUpCall): Promise<SignUpResult> => answerWith(NEW_USER));
const mockReplace = jest.fn();

jest.mock("@/lib/supabase", () => ({
  supabase: { auth: { signUp: (call: SignUpCall) => mockSignUp(call) } },
}));
jest.mock("expo-router", () => ({ router: { replace: (href: unknown) => mockReplace(href) } }));

const LABELS = {
  firstName: "Nombre",
  lastName: "Apellido",
  email: "Email",
  phone: "Teléfono",
  address: "Dirección",
  addressNotes: "Referencias (opcional)",
  password: "Contraseña",
  passwordConfirmation: "Confirmá tu contraseña",
} as const;
type Field = keyof typeof LABELS;

const VALID: Record<Field, string> = {
  firstName: " Ana ",
  lastName: "Pérez",
  email: " Ana@Example.com ",
  phone: "11 3344-5566",
  address: 'Av. Rivadavia 4521, piso 3 "B"',
  addressNotes: "",
  password: "clave1234",
  passwordConfirmation: "clave1234",
};

async function fill(values: Partial<Record<Field, string>>) {
  for (const [field, value] of Object.entries(values) as [Field, string][]) {
    await fireEvent.changeText(screen.getByLabelText(LABELS[field]), value);
  }
}

const submit = () => fireEvent.press(screen.getByRole("button", { name: "Crear cuenta" }));

beforeEach(() => jest.clearAllMocks());

describe("sign-up screen", () => {
  test("shows the title, every field and the button", async () => {
    await render(<SignUp />);
    expect(screen.getByRole("header", { name: "Registrate" })).toBeOnTheScreen();
    for (const label of Object.values(LABELS)) expect(screen.getByLabelText(label)).toBeOnTheScreen();
    expect(screen.getByLabelText("Contraseña")).toHaveProp("secureTextEntry", true);
    expect(screen.getByLabelText("Confirmá tu contraseña")).toHaveProp("secureTextEntry", true);
    // RF-44 (change of 2026-11-19): Google only signs in, so Sign-up does not offer it.
    expect(screen.queryByRole("button", { name: "Continuar con Google" })).toBeNull();
  });

  test("RF-5 / RF-6: an empty form is not sent and each required field says so", async () => {
    await render(<SignUp />);
    await submit();
    expect(screen.getAllByText("Completá este campo")).toHaveLength(7);
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  test("RF-6: an error keeps what was typed", async () => {
    await render(<SignUp />);
    await fill({ ...VALID, firstName: "  " });
    await submit();
    expect(screen.getByText("Completá este campo")).toBeOnTheScreen();
    expect(screen.getByLabelText("Dirección")).toHaveDisplayValue('Av. Rivadavia 4521, piso 3 "B"');
    expect(screen.getByLabelText("Contraseña")).toHaveDisplayValue("clave1234");
  });

  test.each([
    ["RF-7", { phone: "0113344556" }, "Ingresá 10 dígitos con el código de área, sin 0 ni 15. Ej.: 11 3344 5566"],
    ["RF-9", { password: "clavesecreta", passwordConfirmation: "clavesecreta" }, "Usá entre 8 y 72 caracteres, con al menos una letra y un número"],
    ["RF-10", { passwordConfirmation: "clave12345" }, "Las contraseñas no coinciden"],
    ["RF-11", { email: "ana@example" }, "Ingresá un email válido, como nombre@ejemplo.com"],
    ["RF-6", { addressNotes: "a".repeat(121) }, "Usá hasta 120 caracteres"],
  ])("%s: an invalid field is marked and nothing is sent", async (_rf, changes, message) => {
    await render(<SignUp />);
    await fill({ ...VALID, ...changes });
    await submit();
    expect(screen.getByText(message)).toBeOnTheScreen();
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  test("RF-4 / RF-8 / RF-13 / RF-14: signUp receives the normalized data and no role", async () => {
    await render(<SignUp />);
    await fill(VALID);
    await submit();
    expect(mockSignUp).toHaveBeenCalledWith({
      email: "ana@example.com",
      password: "clave1234",
      options: {
        data: {
          first_name: "Ana",
          last_name: "Pérez",
          phone: "1133445566",
          address: 'Av. Rivadavia 4521, piso 3 "B"',
          address_notes: null,
        },
      },
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("RF-20: while sending, the button is disabled and busy, and a second tap sends nothing", async () => {
    let answer: (result: SignUpResult) => void = () => {};
    mockSignUp.mockImplementationOnce(() => new Promise<SignUpResult>((resolve) => (answer = resolve)));
    await render(<SignUp />);
    await fill(VALID);

    // fireEvent.press waits for onPress, which stays pending here: the first tap is not awaited.
    const firstTap = submit();
    const button = screen.getByRole("button", { name: "Crear cuenta" });
    await waitFor(() => expect(button).toBeDisabled());
    expect(button).toBeBusy();
    void submit();
    expect(mockSignUp).toHaveBeenCalledTimes(1);

    await act(async () => answer(answerWith(null, new AuthRetryableFetchError("fetch failed", 0))));
    await firstTap;
    expect(screen.getByRole("button", { name: "Crear cuenta" })).toBeEnabled();
  });

  test.each([
    [
      "RF-12: an email that is already registered",
      new AuthApiError("User already registered", 422, "user_already_exists"),
      "Ese email ya está registrado. Si es tuyo, usá ¿Olvidaste tu contraseña?",
    ],
    [
      "RF-15: a profile the database rejects",
      new AuthRetryableFetchError("Database error saving new user", 500),
      "No pudimos crear tu cuenta. Intentá de nuevo",
    ],
    [
      "RF-19: no connection",
      new AuthRetryableFetchError("fetch failed", 0),
      "No hay conexión. Revisá tu internet e intentá de nuevo",
    ],
  ])("%s shows its message and keeps what was typed", async (_case, error, message) => {
    mockSignUp.mockResolvedValueOnce(answerWith(null, error));
    await render(<SignUp />);
    await fill(VALID);
    await submit();
    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(screen.getByLabelText("Email")).toHaveDisplayValue(" Ana@Example.com ");
    expect(screen.getByLabelText("Teléfono")).toHaveDisplayValue("11 3344-5566");
  });

  test("RF-4 / RF-43: a new account goes to the code, replacing Sign-up (going back returns to Welcome)", async () => {
    await render(<SignUp />);
    await fill(VALID);
    await submit();
    expect(mockReplace).toHaveBeenCalledWith({ pathname: "/confirm-email", params: { email: "ana@example.com" } });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test.each([
    ["a confirmed account (a user without identities)", { ...NEW_USER, identities: [] }],
    [
      "an account that was never confirmed (old, with the code sent again)",
      { ...NEW_USER, created_at: "2026-11-20T01:30:00.000Z", confirmation_sent_at: "2026-11-20T01:31:45.977648377Z" },
    ],
  ])("RF-12: %s does not go to the code and points to the recovery", async (_case, user) => {
    mockSignUp.mockResolvedValueOnce(answerWith(user));
    await render(<SignUp />);
    await fill(VALID);
    await submit();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Ese email ya está registrado. Si es tuyo, usá ¿Olvidaste tu contraseña?",
    );
    expect(mockReplace).not.toHaveBeenCalled();
  });

  test("RF-2 / RF-3: the login link replaces Sign-up, so going back returns to Welcome", async () => {
    await render(<SignUp />);
    await fireEvent.press(screen.getByRole("link", { name: "Iniciá sesión" }));
    expect(mockReplace).toHaveBeenCalledWith("/login");
  });
});

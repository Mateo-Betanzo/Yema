import { router } from "expo-router";
import { useRef, useState } from "react";
import { AccessibilityInfo, type TextInputInstance, type TextInputProps } from "react-native";

import { AuthFormScreen, AuthLink, FormAlert } from "@/components/auth-form-screen";
import { PrimaryButton } from "@/components/primary-button";
import { PROFILE_CONTACT_FIELDS, PROFILE_NAME_FIELDS } from "@/components/profile-fields";
import { TextField } from "@/components/text-field";
import { supabase } from "@/lib/supabase";
import { ALREADY_REGISTERED, authErrorMessage } from "@/logic/auth-errors";
import { signUpOutcome } from "@/logic/auth-flow";
import { validateSignUp, type SignUpForm } from "@/logic/auth-validation";

// Sign-up (spec 002: RF-2 to RF-15, RF-19, RF-20). The profile goes as user metadata and the
// database creates it with the client role (RF-14). Since the change of 2026-11-19 the new account
// is unconfirmed and goes to "Confirmá tu email" (RF-4, RF-43); an email with an account, confirmed or
// not, gets the message of RF-12.
type Field = keyof SignUpForm;

const EMPTY: SignUpForm = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  address: "",
  addressNotes: "",
  password: "",
  passwordConfirmation: "",
};

// In the order the keyboard's "next" key walks them: the profile fields are shared with "Editar perfil"
// (spec 010), with the email between the name and the phone.
const FIELDS: { field: Field; label: string; placeholder: string; input: TextInputProps; password?: boolean }[] = [
  ...PROFILE_NAME_FIELDS,
  {
    field: "email",
    label: "Email",
    placeholder: "tucorreo@ejemplo.com",
    input: {
      keyboardType: "email-address",
      autoCapitalize: "none",
      autoCorrect: false,
      autoComplete: "email",
      textContentType: "emailAddress",
    },
  },
  ...PROFILE_CONTACT_FIELDS,
  {
    field: "password",
    label: "Contraseña",
    placeholder: "Tu contraseña",
    password: true,
    input: { autoCapitalize: "none", autoCorrect: false, autoComplete: "new-password", textContentType: "newPassword" },
  },
  {
    field: "passwordConfirmation",
    label: "Confirmá tu contraseña",
    placeholder: "Repetí tu contraseña",
    password: true,
    input: { autoCapitalize: "none", autoCorrect: false, autoComplete: "new-password", textContentType: "newPassword" },
  },
];

export default function SignUp() {
  const [form, setForm] = useState<SignUpForm>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [alert, setAlert] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  // RF-20: a ref, because two taps in a row arrive before the disabled state renders.
  const sendingRef = useRef(false);
  const inputs = useRef<Partial<Record<Field, TextInputInstance | null>>>({});

  function change(field: Field, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function submit() {
    if (sendingRef.current) return;
    const result = validateSignUp(form);
    if (!result.ok) {
      // RF-6: what was typed stays; each field shows its own message.
      setErrors(result.errors);
      setAlert(null);
      AccessibilityInfo.announceForAccessibility("Revisá los campos marcados");
      return;
    }

    setErrors({});
    setAlert(null);
    sendingRef.current = true;
    setSending(true);
    const { email, password, profile } = result.data;
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: profile } });
    sendingRef.current = false;
    setSending(false);
    const outcome = signUpOutcome({ user: data.user, error });
    // A replace: going back from the code returns to Welcome (RF-43).
    if (outcome.kind === "confirm") router.replace({ pathname: "/confirm-email", params: { email } });
    // RF-12, RF-15, RF-19: what was typed stays, so the user can fix it or try again.
    else if (outcome.kind === "already-registered") setAlert(ALREADY_REGISTERED);
    else setAlert(authErrorMessage(outcome.error, "sign-up"));
  }

  return (
    <AuthFormScreen title="Registrate">
      {FIELDS.map(({ field, label, placeholder, input, password }, index) => {
        const next = FIELDS[index + 1]?.field;
        return (
          <TextField
            key={field}
            ref={(instance) => {
              inputs.current[field] = instance;
            }}
            label={label}
            placeholder={placeholder}
            password={password}
            value={form[field]}
            onChangeText={(value) => change(field, value)}
            error={errors[field]}
            {...input}
            returnKeyType={next ? "next" : "go"}
            submitBehavior={next ? "submit" : "blurAndSubmit"}
            onSubmitEditing={next ? () => inputs.current[next]?.focus() : submit}
          />
        );
      })}
      <FormAlert message={alert} />
      <PrimaryButton title="Crear cuenta" onPress={submit} loading={sending} />
      <AuthLink prompt="¿Ya tenés una cuenta?" action="Iniciá sesión" onPress={() => router.replace("/login")} />
    </AuthFormScreen>
  );
}

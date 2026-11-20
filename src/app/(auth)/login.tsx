import { router } from "expo-router";
import { useRef, useState } from "react";
import { isAuthApiError } from "@supabase/supabase-js";
import { AccessibilityInfo, StyleSheet, View, type TextInputInstance } from "react-native";

import { AuthFormScreen, AuthLink, FormAlert } from "@/components/auth-form-screen";
import { PrimaryButton } from "@/components/primary-button";
import { RoundButton } from "@/components/round-button";
import { TextField } from "@/components/text-field";
import { signInWithGoogle } from "@/lib/google-auth";
import { supabase } from "@/lib/supabase";
import { authErrorMessage } from "@/logic/auth-errors";
import { normalizeEmail, validateLogin, type LoginForm } from "@/logic/auth-validation";

// Login (spec 002: RF-2, RF-13, RF-17 to RF-20). On success the session and the guards of the root
// layout take the user to the Home of their role. Change of 2026-11-19: an account that was never
// confirmed gets a new code and goes to "Confirmá tu email" (RF-42), and "¿Olvidaste tu contraseña?"
// opens the recovery (RF-50). "Continuar con Google" signs in to an account that already exists
// (RF-44 to RF-49).
export default function Login() {
  const [form, setForm] = useState<LoginForm>({ email: "", password: "" });
  const [errors, setErrors] = useState<Partial<Record<keyof LoginForm, string>>>({});
  const [alert, setAlert] = useState<string | null>(null);
  const [sending, setSending] = useState<"password" | "google" | null>(null);
  // RF-20: a ref, because two taps in a row arrive before the disabled state renders. One for both
  // buttons: while one is waiting, the other one does nothing.
  const sendingRef = useRef(false);
  const passwordRef = useRef<TextInputInstance>(null);

  function change(field: keyof LoginForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function submit() {
    if (sendingRef.current) return;
    const result = validateLogin(form);
    if (!result.ok) {
      setErrors(result.errors);
      setAlert(null);
      AccessibilityInfo.announceForAccessibility("Revisá los campos marcados");
      return;
    }

    setErrors({});
    setAlert(null);
    sendingRef.current = true;
    setSending("password");
    const { error } = await supabase.auth.signInWithPassword(result.data);
    if (isAuthApiError(error) && error.code === "email_not_confirmed") {
      // RF-42: within 60 s of the last code the server sends none; the last one still works, so the
      // answer is not shown.
      await supabase.auth.resend({ type: "signup", email: result.data.email });
      sendingRef.current = false;
      setSending(null);
      // A push: going back returns to Login (RF-43).
      router.push({ pathname: "/confirm-email", params: { email: result.data.email } });
      return;
    }
    sendingRef.current = false;
    setSending(null);
    // RF-18, RF-19: what was typed stays, so the user can try again.
    if (error) setAlert(authErrorMessage(error, "sign-in"));
  }

  async function continueWithGoogle() {
    if (sendingRef.current) return;
    setAlert(null);
    sendingRef.current = true;
    setSending("google");
    const result = await signInWithGoogle();
    sendingRef.current = false;
    setSending(null);
    // RF-45: the session and the guards take the user to their Home; RF-47: closing Google says nothing.
    // RF-46, RF-49, RF-19: what was typed stays.
    if (result.kind === "error") setAlert(result.message);
  }

  return (
    <AuthFormScreen title="Iniciá sesión">
      <TextField
        label="Email"
        placeholder="tucorreo@ejemplo.com"
        value={form.email}
        onChangeText={(value) => change("email", value)}
        error={errors.email}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <TextField
        ref={passwordRef}
        label="Contraseña"
        placeholder="Tu contraseña"
        password
        value={form.password}
        onChangeText={(value) => change("password", value)}
        error={errors.password}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      <AuthLink
        action="¿Olvidaste tu contraseña?"
        align="end"
        // A push: going back returns to Login (RF-58).
        onPress={() => router.push({ pathname: "/forgot-password", params: { email: normalizeEmail(form.email) } })}
      />
      <FormAlert message={alert} />
      <PrimaryButton
        title="Iniciar sesión"
        onPress={submit}
        loading={sending === "password"}
        disabled={sending === "google"}
      />
      {/* Only the "G" of Google, centered (/feature 2026-11-19); its name stays for screen readers. */}
      <View style={styles.google}>
        <RoundButton
          icon="google"
          label="Continuar con Google"
          onPress={continueWithGoogle}
          loading={sending === "google"}
          disabled={sending === "password"}
        />
      </View>
      <AuthLink prompt="¿No tenés una cuenta?" action="Registrate" onPress={() => router.replace("/sign-up")} />
    </AuthFormScreen>
  );
}

const styles = StyleSheet.create({
  google: {
    alignItems: "center",
  },
});

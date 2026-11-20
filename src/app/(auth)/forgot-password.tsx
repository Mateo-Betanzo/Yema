import { useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, type TextInputInstance } from "react-native";

import { AuthFormScreen, FormAlert, FormLead, ResendCode } from "@/components/auth-form-screen";
import { PrimaryButton } from "@/components/primary-button";
import { TextField } from "@/components/text-field";
import { supabase } from "@/lib/supabase";
import { useResendCooldown } from "@/lib/use-resend-cooldown";
import { authErrorMessage } from "@/logic/auth-errors";
import { validateEmail, validateNewPassword, type NewPasswordForm } from "@/logic/auth-validation";

// "Recuperar contraseña" (spec 002, change of 2026-11-19: RF-50 to RF-58, RF-60, RF-61, RF-19, RF-20).
// Two steps: the email, then the code and the new password. Verifying the code opens a session that the
// app does not enter yet (PASSWORD_RECOVERY); saving the password (USER_UPDATED) takes the user to the
// Home of their role through the guards of the root layout. It also confirms an account that was never
// confirmed (verified against the Auth server, plan 002).
type NewPasswordField = keyof NewPasswordForm;

const EMPTY: NewPasswordForm = { code: "", password: "", passwordConfirmation: "" };
// RF-52: the same message whether the account exists or not.
const SENT = "Si hay una cuenta con ese email, te enviamos un código de 6 dígitos. Si no lo ves, revisá el spam.";

export default function ForgotPassword() {
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(params.email ?? "");
  const [emailError, setEmailError] = useState<string>();
  // The normalized email the code went to: the second step.
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [form, setForm] = useState<NewPasswordForm>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<NewPasswordField, string>>>({});
  const [alert, setAlert] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  // RF-20: a ref, because two taps in a row arrive before the disabled state renders.
  const sendingRef = useRef(false);
  // RF-57: a code works once; after it is verified only the password is sent again.
  const verifiedRef = useRef(false);
  const savedRef = useRef(false);
  const { secondsLeft, restart } = useResendCooldown();
  const passwordRef = useRef<TextInputInstance>(null);
  const confirmationRef = useRef<TextInputInstance>(null);

  // RF-58: leaving with the code verified and no new password closes that session on the phone.
  useEffect(
    () => () => {
      if (verifiedRef.current && !savedRef.current) void supabase.auth.signOut({ scope: "local" });
    },
    [],
  );

  function begin() {
    sendingRef.current = true;
    setSending(true);
    setAlert(null);
  }

  function end() {
    sendingRef.current = false;
    setSending(false);
  }

  async function sendCode() {
    if (sendingRef.current) return;
    const result = validateEmail({ email });
    if (!result.ok) {
      setEmailError(result.errors.email);
      setAlert(null);
      AccessibilityInfo.announceForAccessibility("Revisá el email");
      return;
    }
    setEmailError(undefined);
    begin();
    const { error } = await supabase.auth.resetPasswordForEmail(result.data.email);
    end();
    // RF-19, RF-61: what was typed stays.
    if (error) {
      setAlert(authErrorMessage(error, "recover"));
      return;
    }
    restart();
    setSentTo(result.data.email);
    // The button that had the focus is gone with the first step: the screen reader hears the news.
    AccessibilityInfo.announceForAccessibility(SENT);
  }

  async function resend() {
    if (!sentTo) return;
    setAlert(null);
    const { error } = await supabase.auth.resetPasswordForEmail(sentTo);
    if (error) {
      setAlert(authErrorMessage(error, "recover"));
      return;
    }
    restart();
    setAlert("Te mandamos un código nuevo");
  }

  function change(field: NewPasswordField, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function savePassword() {
    if (sendingRef.current || !sentTo) return;
    const result = validateNewPassword(form);
    if (!result.ok) {
      setErrors(result.errors);
      setAlert(null);
      AccessibilityInfo.announceForAccessibility("Revisá los campos marcados");
      return;
    }
    setErrors({});
    begin();
    if (!verifiedRef.current) {
      const { error } = await supabase.auth.verifyOtp({ email: sentTo, token: result.data.code, type: "recovery" });
      if (error) {
        end();
        // RF-56, RF-19: nothing changes and what was typed stays.
        setAlert(authErrorMessage(error, "reset"));
        return;
      }
      verifiedRef.current = true;
    }
    const { error } = await supabase.auth.updateUser({ password: result.data.password });
    if (!error) savedRef.current = true;
    end();
    // RF-57: another password can be tried with the same verified code.
    if (error) setAlert(authErrorMessage(error, "reset"));
  }

  if (!sentTo) {
    return (
      <AuthFormScreen title="Recuperar contraseña">
        <FormLead>Escribí tu email y te mandamos un código para elegir una contraseña nueva.</FormLead>
        <TextField
          label="Email"
          placeholder="tucorreo@ejemplo.com"
          value={email}
          onChangeText={(value) => {
            setEmail(value);
            setEmailError(undefined);
          }}
          error={emailError}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="go"
          onSubmitEditing={sendCode}
        />
        <FormAlert message={alert} />
        <PrimaryButton title="Enviar código" onPress={sendCode} loading={sending} />
      </AuthFormScreen>
    );
  }

  return (
    <AuthFormScreen title="Recuperar contraseña">
      <FormLead>{SENT}</FormLead>
      <TextField
        label="Código"
        placeholder="123456"
        value={form.code}
        onChangeText={(value) => change("code", value)}
        error={errors.code}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={6}
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <TextField
        ref={passwordRef}
        label="Contraseña nueva"
        placeholder="Tu contraseña nueva"
        password
        value={form.password}
        onChangeText={(value) => change("password", value)}
        error={errors.password}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => confirmationRef.current?.focus()}
      />
      <TextField
        ref={confirmationRef}
        label="Confirmá tu contraseña"
        placeholder="Repetí tu contraseña"
        password
        value={form.passwordConfirmation}
        onChangeText={(value) => change("passwordConfirmation", value)}
        error={errors.passwordConfirmation}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={savePassword}
      />
      <FormAlert message={alert} />
      <PrimaryButton title="Cambiar contraseña" onPress={savePassword} loading={sending} />
      <ResendCode secondsLeft={secondsLeft} onResend={resend} />
    </AuthFormScreen>
  );
}

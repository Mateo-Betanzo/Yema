import { useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { AccessibilityInfo } from "react-native";

import { AuthFormScreen, FormAlert, FormLead, ResendCode } from "@/components/auth-form-screen";
import { PrimaryButton } from "@/components/primary-button";
import { TextField } from "@/components/text-field";
import { supabase } from "@/lib/supabase";
import { useResendCooldown } from "@/lib/use-resend-cooldown";
import { authErrorMessage } from "@/logic/auth-errors";
import { validateCode } from "@/logic/auth-validation";

// "Confirmá tu email" (spec 002, change of 2026-11-19: RF-39 to RF-41, RF-60, RF-61, RF-19, RF-20).
// It opens right after a code was sent: from the sign-up (replace, so going back shows Welcome) or from
// Login (push, back to Login), RF-43. The right code opens the session (SIGNED_IN) and the guards of the
// root layout take the client to their Home.
export default function ConfirmEmail() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string>();
  const [alert, setAlert] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  // RF-20: a ref, because two taps in a row arrive before the disabled state renders.
  const sendingRef = useRef(false);
  const { secondsLeft, restart } = useResendCooldown();

  async function confirm() {
    if (sendingRef.current) return;
    const result = validateCode({ code });
    if (!result.ok) {
      setCodeError(result.errors.code);
      setAlert(null);
      AccessibilityInfo.announceForAccessibility("Revisá el código");
      return;
    }

    setCodeError(undefined);
    setAlert(null);
    sendingRef.current = true;
    setSending(true);
    const { error } = await supabase.auth.verifyOtp({ email, token: result.data.code, type: "email" });
    sendingRef.current = false;
    setSending(false);
    // RF-41, RF-19: what was typed stays.
    if (error) setAlert(authErrorMessage(error, "confirm"));
  }

  async function resend() {
    setAlert(null);
    const { error } = await supabase.auth.resend({ type: "signup", email });
    if (error) {
      setAlert(authErrorMessage(error, "resend"));
      return;
    }
    restart();
    setAlert("Te mandamos un código nuevo");
  }

  return (
    <AuthFormScreen title="Confirmá tu email">
      <FormLead>{`Te mandamos un código de 6 dígitos a ${email}. Si no lo ves, revisá el spam.`}</FormLead>
      <TextField
        label="Código"
        placeholder="123456"
        value={code}
        onChangeText={(value) => {
          setCode(value);
          setCodeError(undefined);
        }}
        error={codeError}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={6}
        returnKeyType="go"
        onSubmitEditing={confirm}
      />
      <FormAlert message={alert} />
      <PrimaryButton title="Confirmar" onPress={confirm} loading={sending} />
      <ResendCode secondsLeft={secondsLeft} onResend={resend} />
    </AuthFormScreen>
  );
}

import { useEffect, type ReactNode } from "react";
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { KeyboardScroll } from "@/components/keyboard-scroll";
import { ScreenBackground } from "@/components/screen-background";
import { theme } from "@/theme";

// The frame shared by Login and Sign-up (spec 002): the dark background gradient, a centered title,
// and the form in a KeyboardScroll, so the keyboard never covers the active field or the button.
export function AuthFormScreen({ title, children }: { title: string; children: ReactNode }) {
  return (
    <ScreenBackground>
      <SafeAreaView style={styles.fill}>
        <KeyboardScroll contentContainerStyle={styles.content}>
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          <View style={styles.form}>{children}</View>
        </KeyboardScroll>
      </SafeAreaView>
    </ScreenBackground>
  );
}

/** RF-12, RF-15, RF-18, RF-19: the error of the whole form, read by the screen reader. */
export function FormAlert({ message }: { message: string | null }) {
  // VoiceOver does not read new text by itself (the live region only works on Android).
  useEffect(() => {
    if (message) AccessibilityInfo.announceForAccessibility(message);
  }, [message]);

  if (!message) return null;
  return (
    <Text style={styles.alert} accessibilityRole="alert" accessibilityLiveRegion="assertive">
      {message}
    </Text>
  );
}

/**
 * "¿No tenés una cuenta? Registrate": the link between Login and Sign-up (RF-2). Without a prompt and
 * aligned to the end, "¿Olvidaste tu contraseña?" under the password, as the Figma (RF-50).
 */
export function AuthLink({
  prompt,
  action,
  onPress,
  align = "center",
}: {
  prompt?: string;
  action: string;
  onPress: () => void;
  align?: "center" | "end";
}) {
  return (
    <View style={[styles.linkRow, align === "end" && styles.linkRowEnd]}>
      {prompt ? <Text style={styles.linkPrompt}>{prompt} </Text> : null}
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={action}
        onPress={onPress}
        // 14 pt text plus this slop gives a touch area of at least 48 pt.
        hitSlop={{ top: 16, bottom: 16, left: 8, right: 8 }}
        style={({ pressed }) => pressed && styles.pressed}
      >
        <Text style={styles.link}>{action}</Text>
      </Pressable>
    </View>
  );
}

/** The line under the title of "Confirmá tu email" and "Recuperar contraseña" (change of 2026-11-19). */
export function FormLead({ children }: { children: string }) {
  return <Text style={styles.lead}>{children}</Text>;
}

/**
 * RF-60: the wait after each email with a code, then "¿No te llegó? Reenviar código". The wait has the
 * height of the link, so the screen does not jump when the count ends.
 */
export function ResendCode({ secondsLeft, onResend }: { secondsLeft: number; onResend: () => void }) {
  if (secondsLeft > 0) return <Text style={styles.wait}>{`Podés pedir otro código en ${secondsLeft} s`}</Text>;
  return <AuthLink prompt="¿No te llegó?" action="Reenviar código" onPress={onResend} />;
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: theme.screenMargin,
    paddingVertical: theme.spacing.huge,
  },
  title: {
    color: theme.colors.text,
    fontSize: theme.typography.sizes.xxl,
    fontWeight: theme.typography.weights.bold,
    textAlign: "center",
    marginBottom: theme.spacing.huge,
  },
  form: {
    gap: theme.spacing.lg,
  },
  alert: {
    color: theme.colors.text,
    fontSize: theme.typography.sizes.sm,
    textAlign: "center",
  },
  linkRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
    minHeight: 48,
  },
  lead: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.sizes.md,
    textAlign: "center",
  },
  wait: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.sizes.sm,
    textAlign: "center",
    lineHeight: 48,
  },
  linkRowEnd: {
    justifyContent: "flex-end",
  },
  linkPrompt: {
    color: theme.colors.text,
    fontSize: theme.typography.sizes.sm,
  },
  pressed: {
    opacity: 0.6,
  },
  link: {
    color: theme.colors.link,
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.semibold,
  },
});

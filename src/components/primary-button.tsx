import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";

import { theme } from "@/theme";

// "primary": flat #d73402 (a deviation from the Figma gradient, plan 002). "outline": black with a
// white border, the "Crear cuenta" button of Welcome. "light": white with violet text, on a violet card
// ("Tu más comprado", /feature 2026-11-18; violet on white 4.69:1).
type Variant = "primary" | "outline" | "light";

type Props = {
  title: string;
  /** What a screen reader says, when the title alone is not enough ("Llamar a Rocío Fernández"). */
  accessibilityLabel?: string;
  onPress: () => void;
  variant?: Variant;
  /** RF-20: shows a spinner and ignores taps while something is being sent. */
  loading?: boolean;
  disabled?: boolean;
};

const fills: Record<Variant, { background: string; pressed: string; text: string; border?: string }> = {
  primary: { background: theme.colors.primary, pressed: theme.colors.primaryPressed, text: theme.colors.text },
  outline: {
    background: theme.colors.black,
    pressed: theme.colors.black,
    text: theme.colors.text,
    border: theme.colors.text,
  },
  light: { background: theme.colors.text, pressed: theme.colors.text, text: theme.colors.accent },
};

export function PrimaryButton({
  title,
  accessibilityLabel,
  onPress,
  variant = "primary",
  loading = false,
  disabled = false,
}: Props) {
  const fill = fills[variant];
  const inactive = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: pressed ? fill.pressed : fill.background },
        fill.border && { borderWidth: 1, borderColor: fill.border },
        pressed && styles.pressed,
        disabled && !loading && styles.disabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fill.text} />
      ) : (
        <Text style={[styles.title, { color: fill.text }]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 56,
    borderRadius: theme.radii.pill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.spacing.xxl,
  },
  // A slight press-in, so the button feels heard (emil-design-eng: 0.95–0.98, instant on press).
  pressed: {
    transform: [{ scale: 0.97 }],
  },
  disabled: {
    opacity: 0.5,
  },
  title: {
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.semibold,
  },
});

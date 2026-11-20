import { ActivityIndicator, Pressable, StyleSheet } from "react-native";

import { Icon } from "@/components/icon";
import { theme } from "@/theme";

type Props = {
  icon: "plus" | "minus" | "menu" | "google";
  /** What it does, for screen readers ("Agregar Pack Mediano"). */
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** Spec 002, RF-20: a spinner and no taps while something is being sent ("Continuar con Google"). */
  loading?: boolean;
};

// The round "+" of the Shop rows, as the Figma (spec 004: RF-8, RF-10), the "−" and "+" of the cart
// (RF-14) and the menu of the client Perfil (spec 010, RF-16). 48 pt, with the look of the tab bar
// (theme.barSurface; violet in the Figma, changed on 2026-11-18); disabled it turns grey (the Figma's
// "+" of a product without stock) and ignores taps. A slight press-in, as PrimaryButton. Since the
// /feature of 2026-11-19, also the "G" of "Continuar con Google" in Login.
export function RoundButton({ icon, label, onPress, disabled = false, loading = false }: Props) {
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      {loading ? <ActivityIndicator color={theme.colors.text} /> : <Icon name={icon} size={24} color={theme.colors.text} />}
    </Pressable>
  );
}

const SIZE = 48;

const styles = StyleSheet.create({
  button: {
    width: SIZE,
    height: SIZE,
    borderRadius: theme.radii.pill,
    alignItems: "center",
    justifyContent: "center",
    ...theme.barSurface,
  },
  disabled: {
    backgroundColor: theme.colors.fieldBorder,
  },
  pressed: {
    transform: [{ scale: 0.94 }],
  },
});

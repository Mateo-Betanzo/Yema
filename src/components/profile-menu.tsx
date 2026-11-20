import { router, type Href } from "expo-router";
import { useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon, type IconName } from "@/components/icon";
import { useSession } from "@/lib/session";
import { theme } from "@/theme";

/** A way to another screen, with its SVG of assets/svg. */
export type ProfileMenuLink = { label: string; icon: IconName; href: Href };

type Option = { label: string; icon: IconName; onPress: () => void };

// The menu of the Perfil of both roles (spec 010: RF-17, RF-20, RF-29; spec 011: RF-2 to RF-5, RF-21):
// a native form sheet (profileMenuOptions, in each role's _layout.tsx), which gives the dimmed background,
// closing by dragging it down, tapping outside or "atrás" on Android, and keeps the screen reader inside
// it. Each role passes its links; "Cerrar sesión" always goes last and asks first. Each option closes the
// sheet first and then does its thing; one tap disables them all, so two quick taps do one thing. No
// Figma: full-width rows with an icon and a text, as tall as the rows of the Shop.
export function ProfileMenu({ links }: { links: readonly ProfileMenuLink[] }) {
  const { signOut } = useSession();
  const insets = useSafeAreaInsets();
  const [chosen, setChosen] = useState(false);
  // A ref, because a second tap can arrive before the disabled state renders.
  const choosing = useRef(false);

  function choose(action: () => void) {
    if (choosing.current) return;
    choosing.current = true;
    setChosen(true);
    router.back();
    action();
  }

  function confirmSignOut() {
    // "Cancelar" leaves the user on the Perfil with the session open.
    Alert.alert("¿Cerrar sesión?", undefined, [
      { text: "Cancelar", style: "cancel" },
      { text: "Cerrar sesión", style: "destructive", onPress: () => void signOut() },
    ]);
  }

  const options: Option[] = [
    ...links.map(({ label, icon, href }) => ({ label, icon, onPress: () => router.push(href) })),
    { label: "Cerrar sesión", icon: "log-out", onPress: confirmSignOut },
  ];

  return (
    <View style={[styles.sheet, { paddingBottom: insets.bottom + theme.spacing.lg }]}>
      {options.map(({ label, icon, onPress }) => (
        <Pressable
          key={label}
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ disabled: chosen }}
          disabled={chosen}
          onPress={() => choose(onPress)}
          style={({ pressed }) => [styles.option, pressed && styles.pressed]}
        >
          <Icon name={icon} size={24} color={theme.colors.text} />
          <Text style={styles.label}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    gap: theme.spacing.sm,
    paddingTop: theme.spacing.xl,
    paddingHorizontal: theme.screenMargin,
    backgroundColor: theme.colors.overlay,
  },
  option: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.lg,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radii.lg,
    backgroundColor: theme.colors.surface,
  },
  pressed: {
    opacity: 0.7,
  },
  label: {
    color: theme.colors.text,
    fontSize: theme.typography.sizes.md,
  },
});

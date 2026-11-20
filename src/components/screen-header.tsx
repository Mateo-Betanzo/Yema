import Feather from "@expo/vector-icons/Feather";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Icon, type IconName } from "@/components/icon";
import { theme } from "@/theme";

type Action = {
  icon: IconName;
  label: string;
  onPress: () => void;
  /** A number over the button (spec 010, RF-8: the units of the cart); 0 or missing shows nothing. */
  badge?: number;
};

type Props = {
  /** Without it, only the buttons (the product screen, spec 003, RF-29: its name is in the sheet). */
  title?: string;
  /** Tab roots have no back button (Figma deviation registered in MEMORY.md). */
  back?: boolean;
  /** A round action on the right, like the "+" of Products. */
  action?: Action;
};

// The header of the admin screens, as in the Figma (spec 003): a round back button, the title and an
// optional round action. Both buttons are 48 pt, with the look of the tab bar (theme.barSurface; grey
// and violet in the Figma, changed on 2026-11-18). Spec 010: the action may carry a
// number (the cart of the Home); the label of the button says it, so the badge is hidden from readers.
export function ScreenHeader({ title, back = true, action }: Props) {
  return (
    <View style={styles.header}>
      {back && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Volver"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        >
          <Feather name="chevron-left" size={24} color={theme.colors.text} />
        </Pressable>
      )}
      {title ? (
        <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>
          {title}
        </Text>
      ) : (
        <View style={styles.title} />
      )}
      {action && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={action.label}
          onPress={action.onPress}
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        >
          <Icon name={action.icon} size={24} color={theme.colors.text} />
          {action.badge ? (
            <View
              testID="header-badge"
              style={styles.badge}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <Text style={styles.badgeText}>{action.badge}</Text>
            </View>
          ) : null}
        </Pressable>
      )}
    </View>
  );
}

const BADGE_SIZE = 22;

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    minHeight: 48,
  },
  title: {
    flex: 1,
    color: theme.colors.text,
    fontSize: theme.typography.sizes.xxl,
    fontWeight: theme.typography.weights.regular,
  },
  button: {
    width: 48,
    height: 48,
    borderRadius: theme.radii.pill,
    alignItems: "center",
    justifyContent: "center",
    ...theme.barSurface,
  },
  pressed: {
    opacity: 0.7,
  },
  // Over the top right corner of the action; white on primary (4.79:1), like every filled control. A
  // ring of the background separates it from the button (it was violet, with the same luminance as the
  // orange), and it grows with the system text size instead of clipping it.
  badge: {
    position: "absolute",
    top: -theme.spacing.xs,
    right: -theme.spacing.xs,
    minWidth: BADGE_SIZE,
    minHeight: BADGE_SIZE,
    paddingHorizontal: theme.spacing.xs,
    borderWidth: 2,
    borderColor: theme.colors.canvas,
    borderRadius: theme.radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primary,
  },
  badgeText: {
    color: theme.colors.text,
    fontSize: theme.typography.sizes.xs,
    fontWeight: theme.typography.weights.semibold,
  },
});

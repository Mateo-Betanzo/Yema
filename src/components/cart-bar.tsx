import { LinearGradient } from "expo-linear-gradient";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TAB_BAR_TOP } from "@/components/tab-bar";
import { formatProductCount } from "@/logic/cart";
import { formatARS } from "@/logic/currency";
import { theme } from "@/theme";

type Props = {
  total: number;
  units: number;
  onPress: () => void;
  /** Its height including the gap above the tab bar: it grows with the system text size. */
  onHeight?: (height: number) => void;
  /** The action of the pill (spec 008: "Confirmar venta"). */
  label?: string;
  /** Nothing to act on yet (spec 008, RF-7: an empty sale): grey and ignores taps. */
  disabled?: boolean;
  /** Being sent (spec 008, RF-12): the pill shows it and the bar ignores taps. */
  busy?: boolean;
  /** Over the floating tab bar (the Shop), or at the bottom of a screen without it (the counter sale). */
  overTabBar?: boolean;
};

// The cart bar of the Shop, as the Figma (spec 004, RF-13): the orange gradient floating above the tab
// bar, the total, "N productos" and a black "Ver carrito" pill. The whole bar is one button, so its
// touch area is the bar and not only the pill. Spec 008 reuses it for the counter sale: "Confirmar venta",
// grey while the sale is empty, busy while it is sent, at the bottom of a screen without the tab bar.
export function CartBar({
  total,
  units,
  onPress,
  onHeight,
  label = "Ver carrito",
  disabled = false,
  busy = false,
  overTabBar = true,
}: Props) {
  const insets = useSafeAreaInsets();
  const inactive = disabled || busy;
  return (
    <View
      testID="cart-bar"
      style={[styles.wrapper, { bottom: insets.bottom + (overTabBar ? TAB_BAR_TOP : 0) + theme.spacing.sm }]}
      pointerEvents="box-none"
      onLayout={(event) => onHeight?.(event.nativeEvent.layout.height + theme.spacing.sm)}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${formatProductCount(units)}, ${formatARS(total)}`}
        accessibilityState={{ disabled: inactive, busy }}
        disabled={inactive}
        onPress={onPress}
        style={({ pressed }) => [styles.pressable, pressed && styles.pressed]}
      >
        <LinearGradient
          // Disabled, the bar loses its orange: there is nothing to act on yet.
          colors={
            disabled
              ? [theme.colors.surface, theme.colors.surface]
              : [theme.colors.primary, theme.colors.primaryGradientEnd]
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.bar}
        >
          <View style={styles.texts}>
            <Text style={styles.total}>{formatARS(total)}</Text>
            <Text style={styles.units}>{formatProductCount(units)}</Text>
          </View>
          <View style={styles.pill}>
            {busy ? (
              <ActivityIndicator accessibilityLabel="Enviando" color={theme.colors.text} />
            ) : (
              <Text style={[styles.pillText, disabled && styles.pillTextDisabled]}>{label}</Text>
            )}
          </View>
        </LinearGradient>
      </Pressable>
    </View>
  );
}

/** Room the Shop leaves under its last product until the bar reports its real height. */
export const CART_BAR_SPACE = 80;

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: theme.spacing.lg,
    right: theme.spacing.lg,
  },
  pressable: {
    borderRadius: theme.radii.xl,
    overflow: "hidden",
  },
  pressed: {
    transform: [{ scale: 0.98 }],
  },
  bar: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    paddingLeft: theme.spacing.xl,
    paddingRight: theme.spacing.md,
  },
  texts: {
    flex: 1,
  },
  total: {
    color: theme.colors.text,
    fontSize: theme.typography.sizes.xl,
    fontWeight: theme.typography.weights.bold,
  },
  units: {
    color: theme.colors.text,
    fontSize: theme.typography.sizes.sm,
  },
  pill: {
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: theme.spacing.xl,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.black,
  },
  pillText: {
    color: theme.colors.text,
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.semibold,
  },
  // Grey on black: 6.52:1, and the label already says why (the total is $0).
  pillTextDisabled: {
    color: theme.colors.textSecondary,
  },
});

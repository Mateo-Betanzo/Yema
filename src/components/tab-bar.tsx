import type { BottomTabBarProps } from "expo-router/js-tabs";
import { Pressable, StyleSheet, View } from "react-native";

import { Icon, type IconName } from "@/components/icon";
import { theme } from "@/theme";

type Props = BottomTabBarProps & {
  /** The icon of each route, by route name. */
  icons: Record<string, IconName>;
};

// The floating pill of the Figma (spec 002, RF-27): icons only, each with its name as accessible label;
// the active tab sits on a lighter circle. The press handling copies expo-router's default bar. Tabs
// are keyed by route name: expo-router renames the key of a tab on its first visit ("profile" →
// "profile:0-1"), and keyed by it the button remounted.
export function TabBar({ state, descriptors, emitter, navigateToTab, insets, icons }: Props) {
  return (
    <View style={[styles.wrapper, { bottom: insets.bottom + theme.spacing.sm }]} pointerEvents="box-none">
      <View style={styles.bar} accessibilityRole="tablist">
        {state.routes.map((route, index) => {
          const focused = index === state.index;
          const { options } = descriptors[route.key];
          const label = options.tabBarAccessibilityLabel ?? options.title ?? route.name;

          function onPress() {
            const event = emitter.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
            if (!event.defaultPrevented && !focused) navigateToTab(route.key);
          }

          return (
            <Pressable
              key={route.name}
              accessibilityRole="tab"
              accessibilityLabel={label}
              accessibilityState={{ selected: focused }}
              onPress={onPress}
              style={({ pressed }) => [styles.tab, focused && styles.tabActive, pressed && styles.pressed]}
            >
              <Icon name={icons[route.name]} size={ICON_SIZE} color={theme.colors.text} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const TAB_SIZE = 56;
const ICON_SIZE = 28;

/** Height of the floating bar over the safe area: its gap to the edge, the tab, its padding and border. */
export const TAB_BAR_TOP = theme.spacing.sm + TAB_SIZE + 2 * theme.spacing.sm + 2;

/**
 * Bottom space a scrollable screen leaves for the floating bar, on top of the safe area: the bar and
 * some room above it.
 */
export const TAB_BAR_SPACE = TAB_BAR_TOP + theme.spacing.lg;

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  bar: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    padding: theme.spacing.sm,
    borderRadius: theme.radii.pill,
    ...theme.barSurface,
  },
  tab: {
    width: TAB_SIZE,
    height: TAB_SIZE,
    borderRadius: theme.radii.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  tabActive: {
    backgroundColor: theme.colors.surface,
  },
  pressed: {
    opacity: 0.7,
  },
});

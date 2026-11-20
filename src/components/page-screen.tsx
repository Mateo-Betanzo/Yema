import type { ComponentProps, ReactNode } from "react";
import { RefreshControl, StyleSheet, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { KeyboardScroll } from "@/components/keyboard-scroll";
import { ScreenBackground } from "@/components/screen-background";
import { ScreenHeader } from "@/components/screen-header";
import { TAB_BAR_SPACE } from "@/components/tab-bar";
import { theme } from "@/theme";

type Props = ComponentProps<typeof ScreenHeader> & {
  /** A tab root: leaves room at the bottom for the floating tab bar. */
  tabRoot?: boolean;
  /** Something that floats over the bottom of the screen (the cart bar of the Shop), outside the scroll. */
  footer?: ReactNode;
  /** Extra room the scroll leaves at the bottom so the footer never covers the last item. */
  footerSpace?: number;
  /** Pulling the screen down calls it (spec 005, RF-6); without it, the screen does not refresh. */
  onRefresh?: () => void;
  refreshing?: boolean;
  children: ReactNode;
};

// The frame of the screens with a header (spec 003: the admin lists and forms, and the Shop): the
// background gradient, the safe area, the Figma header and a scroll view that keeps the focused field
// above the keyboard.
export function PageScreen({
  tabRoot = false,
  footer,
  footerSpace = 0,
  onRefresh,
  refreshing = false,
  children,
  ...header
}: Props) {
  // A tab root does not take the bottom safe area (the floating tab bar sits over it), so its scroll
  // leaves room for the bar and for that area, or the last item stays under the bar (/feature 2026-11-18).
  const insets = useSafeAreaInsets();
  const bottom = tabRoot ? TAB_BAR_SPACE + insets.bottom : theme.spacing.huge;
  return (
    <ScreenBackground>
      <SafeAreaView style={styles.fill} edges={tabRoot ? ["top", "left", "right"] : undefined}>
        <KeyboardScroll
          refreshControl={
            onRefresh ? (
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.text} />
            ) : undefined
          }
          contentContainerStyle={[styles.content, { paddingBottom: bottom + footerSpace }]}
        >
          <ScreenHeader {...header} />
          <View style={styles.body}>{children}</View>
        </KeyboardScroll>
      </SafeAreaView>
      {footer}
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  content: {
    paddingHorizontal: theme.screenMargin,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.huge,
    gap: theme.spacing.xxl,
  },
  body: {
    gap: theme.spacing.lg,
  },
});

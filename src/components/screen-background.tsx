import { LinearGradient } from "expo-linear-gradient";
import type { ReactNode } from "react";
import { StyleSheet } from "react-native";

import { theme } from "@/theme";

// The background of every screen in the Figma: a vertical gradient from #121116 to black.
export function ScreenBackground({ children }: { children: ReactNode }) {
  return (
    <LinearGradient
      colors={[theme.colors.backgroundGradient.top, theme.colors.backgroundGradient.bottom]}
      style={styles.fill}
    >
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});

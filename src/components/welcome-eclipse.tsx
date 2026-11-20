import { Image, StyleSheet, View } from "react-native";
import Animated, { cubicBezier, useReducedMotion } from "react-native-reanimated";

import { theme } from "@/theme";

// The orange crescent of Welcome (Figma 2026-11-07): a blurred orange disc, a pale highlight on its rim
// and a black disc on top that leaves only the upper edge visible. The blurred layers are PNGs
// exported from the Figma at 3x, because React Native cannot blur a shape.
//
// Motion (decorative, seen once per visit): the glow breathes and the highlight slides a few degrees
// along the rim, slow and out of step so it reads as light, not as movement. Reanimated CSS animations
// run on the UI thread. With reduce motion on, it stays still.

const EASE_IN_OUT = cubicBezier(0.77, 0, 0.175, 1);

// Sizes and offsets from the Figma, relative to the render bounds of the glow (pt).
const GLOW = 344;
const DISC = 340;
const DISC_TOP = 39;
const HIGHLIGHT = { left: 183.1, top: 16, width: 127.1, height: 106 };
/** How much of the crescent's black disc sits under the title, as in the Figma. */
export const ECLIPSE_OVERLAP = 61;

const breathe = {
  animationName: { from: { opacity: 0.78 }, to: { opacity: 1 } },
  animationDuration: "3200ms",
  animationIterationCount: "infinite",
  animationDirection: "alternate",
  animationTimingFunction: EASE_IN_OUT,
} as const;

const shimmer = {
  animationName: {
    from: { opacity: 0.55, transform: [{ rotate: "-16deg" }] },
    to: { opacity: 1, transform: [{ rotate: "12deg" }] },
  },
  animationDuration: "7000ms",
  animationIterationCount: "infinite",
  animationDirection: "alternate",
  animationTimingFunction: EASE_IN_OUT,
} as const;

export function WelcomeEclipse() {
  const reduced = useReducedMotion();

  return (
    <View
      testID="welcome-eclipse"
      style={styles.container}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    >
      <Animated.View testID="welcome-eclipse-glow" style={[styles.glow, !reduced && breathe]}>
        <Image source={require("@/assets/images/welcome-glow.png")} style={styles.fill} />
      </Animated.View>
      {/* Same box as the glow, so rotating it moves the highlight along the rim. */}
      <Animated.View testID="welcome-eclipse-highlight" style={[styles.glow, !reduced && shimmer]}>
        <Image source={require("@/assets/images/welcome-highlight.png")} style={styles.highlight} />
      </Animated.View>
      <View style={styles.disc} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: GLOW,
    height: DISC_TOP + DISC,
    alignSelf: "center",
  },
  glow: {
    position: "absolute",
    top: 0,
    left: 0,
    width: GLOW,
    height: GLOW,
  },
  fill: {
    width: "100%",
    height: "100%",
  },
  highlight: {
    position: "absolute",
    ...HIGHLIGHT,
  },
  disc: {
    position: "absolute",
    top: DISC_TOP,
    left: (GLOW - DISC) / 2,
    width: DISC,
    height: DISC,
    borderRadius: DISC / 2,
    backgroundColor: theme.colors.black,
  },
});

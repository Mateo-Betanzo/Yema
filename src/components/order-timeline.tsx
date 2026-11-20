import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, Text, View } from "react-native";
import Animated, { cubicBezier, useReducedMotion } from "react-native-reanimated";

import type { OrderStatus } from "@/logic/admin-orders";
import {
  formatStepTime,
  timelineLabel,
  timelineStep,
  timelineSteps,
  type ClientOrderBase,
} from "@/logic/client-orders";
import { theme } from "@/theme";

const STEP_COUNT = 4;

// The reached steps in white, the next one lighter and the rest dark.
function segmentColor(index: number, step: number) {
  if (index < step) return theme.colors.text;
  return index === step ? NEXT : MISSING;
}

/**
 * The four segments of the order card, as the Figma (spec 006, RF-3): the steps reached in white and the
 * missing ones in black at 30 % over the orange. The status is also in the card's title and in this
 * label, so the bar is never the only sign of it. Nothing for a rejected or cancelled order (RF-10).
 * /feature 2026-11-18: while the order is on its way, a light crosses the next step (the first dark
 * segment) from left to right every little while, as something loading; a delivered order has no next
 * step. With reduce motion on, the bar stays still.
 * /feature 2026-11-18: the next step is lighter than the missing ones after it (also with reduce motion).
 */
export function TimelineBar({ status }: { status: OrderStatus }) {
  const reduced = useReducedMotion();
  const step = timelineStep(status);
  const label = timelineLabel(status);
  if (step === null || label === null) return null;
  return (
    <View style={styles.bar} accessible accessibilityLabel={label}>
      {Array.from({ length: STEP_COUNT }, (_, index) => (
        <View
          key={index}
          testID={`timeline-segment-${index + 1}`}
          style={{ ...styles.segment, backgroundColor: segmentColor(index, step) }}
        >
          {index === step && !reduced && <Shimmer />}
        </View>
      ))}
    </View>
  );
}

// animate-expo: a loop with no state change is a Reanimated CSS animation, on the UI thread; only
// transform. A band 70 % as wide as the segment enters from its left (-100 % of its own width), leaves
// by its right (+200 %) in 63 % of the cycle and waits out of sight for the rest: about 1.9 s of
// sweep and 1.1 s of rest. Ease-in-out, as anything that moves on screen.
const sweep = {
  animationName: {
    "0%": { transform: [{ translateX: "-100%" }] },
    "63%": { transform: [{ translateX: "200%" }] },
    "100%": { transform: [{ translateX: "200%" }] },
  },
  animationDuration: "3000ms",
  animationIterationCount: "infinite",
  animationTimingFunction: cubicBezier(0.77, 0, 0.175, 1),
} as const;

/** The light of the next step: white that fades in and out across the band, over the dark segment. */
function Shimmer() {
  return (
    <Animated.View testID="timeline-shimmer" style={[styles.shimmer, sweep]}>
      <LinearGradient
        colors={["rgba(255, 255, 255, 0)", "rgba(255, 255, 255, 0.9)", "rgba(255, 255, 255, 0)"]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}

/**
 * The steps of the order detail (spec 006, RF-23): a dot, the step and when it was reached ("vie 13 nov
 * 10:32"); the missing ones in grey and without a time. A rejected or cancelled order ends in that
 * status instead of the missing steps.
 */
export function TimelineSteps({ order }: { order: ClientOrderBase }) {
  const steps = timelineSteps(order);
  return (
    <View style={styles.steps}>
      {steps.map((step, index) => {
        const time = step.at ? formatStepTime(step.at) : null;
        const last = index === steps.length - 1;
        return (
          <View key={step.label} style={styles.step}>
            <View style={styles.rail} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <View style={[styles.dot, !time && styles.dotMissing]} />
              {!last && <View style={styles.line} />}
            </View>
            <View style={styles.stepTexts} accessible accessibilityLabel={`${step.label}, ${time ?? "pendiente"}`}>
              <Text style={[styles.stepLabel, !time && styles.missing]}>{step.label}</Text>
              {time ? <Text style={styles.time}>{time}</Text> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

// The missing segments of the Figma: dark over the orange gradient.
const MISSING = "rgba(0, 0, 0, 0.3)";
// The next step: white at 35 % over the orange, lighter than the missing ones; its light goes to 90 %.
const NEXT = "rgba(255, 255, 255, 0.35)";
const DOT = 12;

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    gap: theme.spacing.sm,
  },
  // overflow: the light stays inside the rounded segment.
  segment: {
    flex: 1,
    height: 6,
    borderRadius: theme.radii.pill,
    overflow: "hidden",
  },
  shimmer: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: "70%",
  },
  steps: {
    gap: 0,
  },
  step: {
    flexDirection: "row",
    gap: theme.spacing.md,
  },
  rail: {
    width: DOT,
    alignItems: "center",
    paddingTop: 4,
  },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.text,
  },
  // A missing step: a grey ring.
  dotMissing: {
    backgroundColor: "transparent",
    borderWidth: 2,
    borderColor: theme.colors.textSecondary,
  },
  line: {
    flex: 1,
    width: 2,
    marginVertical: 2,
    backgroundColor: theme.colors.fieldBorder,
  },
  stepTexts: {
    flex: 1,
    gap: 2,
    paddingBottom: theme.spacing.lg,
  },
  stepLabel: {
    color: theme.colors.text,
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.semibold,
  },
  missing: {
    color: theme.colors.textSecondary,
    fontWeight: theme.typography.weights.regular,
  },
  time: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.sizes.sm,
  },
});

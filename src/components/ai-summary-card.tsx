import { LinearGradient } from "expo-linear-gradient";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";

import { Icon } from "@/components/icon";
import { PrimaryButton } from "@/components/primary-button";
import type { DailySummaryCard } from "@/lib/daily-summary";
import { theme } from "@/theme";

const BORDER = 1.5;
const [VIOLET, BLUE, PINK] = theme.colors.aiGlow;

// animate-expo: an ambient loop with no state change is a Reanimated CSS animation, on the UI thread, and
// only transform. The gradient layer is twice as wide as the card and repeats violet, blue and pink twice,
// so moving it by half its own width (-50 %) lands on the same picture: an endless loop without a jump.
// Linear, as any constant motion; 8 s, so it reads as a slow shine, not as a pulse. With "Reduce motion"
// it stays still (RF-5).
const flow = {
  animationName: {
    from: { transform: [{ translateX: "0%" }] },
    to: { transform: [{ translateX: "-50%" }] },
  },
  animationDuration: "8000ms",
  animationIterationCount: "infinite",
  animationTimingFunction: "linear",
} as const;

const TITLES = { today: "Resumen del día", yesterday: "Resumen de ayer" } as const;

type Props = {
  card: DailySummaryCard;
  onRetry: () => void;
  /** The screen is not on view (another tab): the border stops, so an endless loop spends nothing unseen. */
  paused?: boolean;
};

// The "Resumen del día" of the admin Dashboard (spec 012: RF-1 to RF-5, RF-14, RF-18 to RF-22), without
// Figma: the author's reference of a dark card with a light border in a violet, blue and pink gradient
// (brief confirmed on 2026-11-19). The text always sits on the dark inside (white 18:1, grey 5.5:1), so
// the light of the border never touches its contrast. The title, the text and "Hecho con IA" are read as
// one block; "Reintentar" is its own button.
export function AiSummaryCard({ card, onRetry, paused = false }: Props) {
  const reduced = useReducedMotion();
  const title = card.kind === "yesterday" ? TITLES.yesterday : TITLES.today;

  return (
    <View testID="ai-summary-card" style={styles.frame}>
      <Animated.View
        testID="ai-summary-glow"
        style={[styles.glow, !reduced && flow, !reduced && { animationPlayState: paused ? "paused" : "running" }]}
        accessible={false}
        importantForAccessibility="no-hide-descendants"
      >
        <LinearGradient
          colors={[VIOLET, BLUE, PINK, VIOLET, BLUE, PINK, VIOLET]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <View style={styles.inside}>
        <Content card={card} title={title} onRetry={onRetry} />
      </View>
    </View>
  );
}

function Content({ card, title, onRetry }: Omit<Props, "paused"> & { title: string }) {
  if (card.kind === "today" || card.kind === "yesterday") {
    return (
      <>
        <Block title={title} lines={[card.text]} footer="Hecho con IA" />
        {card.updateFailed ? <Retry message="No pudimos actualizar el resumen" onRetry={onRetry} /> : null}
      </>
    );
  }
  if (card.kind === "waiting") return <Block title={title} lines={[]} note="El resumen de hoy se arma a las 21 h" />;
  if (card.kind === "loading") return <Block title={title} lines={[]} note="Armando el resumen…" busy />;
  return (
    <>
      <Block title={title} lines={[]} />
      <Retry message="No pudimos armar el resumen" onRetry={onRetry} />
    </>
  );
}

/** The title with the icon, and what the card says, read as one block by a screen reader. */
function Block({
  title,
  lines,
  footer,
  note,
  busy = false,
}: {
  title: string;
  lines: readonly string[];
  footer?: string;
  note?: string;
  busy?: boolean;
}) {
  const label = [title, ...lines, note, footer].filter(Boolean).join(". ").replace(/\.\. /g, ". ");
  return (
    <View testID="ai-summary-text" accessible accessibilityLabel={label} style={styles.block}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.iconSquare}>
          <Icon name="sparks" size={22} color={theme.colors.text} />
        </View>
      </View>
      {lines.map((line) => (
        <Text key={line} style={styles.text}>
          {line}
        </Text>
      ))}
      {note ? (
        <View style={styles.note}>
          {busy ? <ActivityIndicator color={theme.colors.textSecondary} /> : null}
          <Text style={styles.secondary}>{note}</Text>
        </View>
      ) : null}
      {footer ? <Text style={styles.secondary}>{footer}</Text> : null}
    </View>
  );
}

/** RF-20 to RF-22: the notice, and "Reintentar" as its own button of at least 48 pt. */
function Retry({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.retry}>
      <Text style={styles.secondary} accessibilityRole="alert">
        {message}
      </Text>
      <PrimaryButton title="Reintentar" variant="outline" onPress={onRetry} />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderRadius: theme.radii.xl,
    padding: BORDER,
    overflow: "hidden",
  },
  glow: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: "200%",
  },
  inside: {
    gap: theme.spacing.md,
    padding: theme.spacing.lg,
    borderRadius: theme.radii.xl - BORDER,
    backgroundColor: theme.colors.overlay,
  },
  block: {
    gap: theme.spacing.sm,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.md,
  },
  title: {
    flex: 1,
    color: theme.colors.text,
    fontSize: theme.typography.sizes.lg,
    fontWeight: theme.typography.weights.semibold,
  },
  iconSquare: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: VIOLET,
    backgroundColor: theme.colors.surface,
  },
  text: {
    color: theme.colors.text,
    fontSize: theme.typography.sizes.md,
    lineHeight: 22,
  },
  note: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  secondary: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.sizes.sm,
  },
  retry: {
    gap: theme.spacing.sm,
  },
});

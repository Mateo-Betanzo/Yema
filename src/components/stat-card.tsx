import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, Text, View } from "react-native";

import { theme } from "@/theme";

export type StatTone = "accent" | "surface" | "primary" | "light";

type Props = {
  title: string;
  /** The value already written ("$100.300", "40"), or null while it loads. */
  value: string | null;
  tone: StatTone;
};

// A total of the admin Home and Dashboard (spec 007: RF-1 to RF-3, RF-6), as the cards of the Figma:
// "Ingresos hoy" violet, "Pedidos hoy" dark, "Por entregar" orange and "Esta semana" white. It only
// informs: one text for the screen reader ("Ingresos hoy, $100.300"), not a button. The value is the
// biggest text and stays on one line, shrinking when an amount of 8 digits does not fit.
// Contrast: white on accent 4.69:1, on primary 4.79:1; secondary on surface 4.94:1; black on white.
export function StatCard({ title, value, tone }: Props) {
  // One element read as one text.
  const a11y = { accessible: true, accessibilityLabel: `${title}, ${value ?? "cargando"}` };
  const content = (
    <>
      <Text style={[styles.title, TITLE[tone]]}>{title}</Text>
      <Text style={[styles.value, VALUE[tone]]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>
        {value ?? "—"}
      </Text>
    </>
  );

  if (tone === "primary") {
    return (
      <LinearGradient
        {...a11y}
        colors={[theme.colors.primary, theme.colors.primaryGradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}
      >
        {content}
      </LinearGradient>
    );
  }
  return (
    <View {...a11y} style={[styles.card, BACKGROUND[tone]]}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minHeight: 104,
    borderRadius: theme.radii.xl,
    padding: theme.spacing.xl,
    gap: theme.spacing.xs,
    justifyContent: "center",
  },
  title: {
    fontSize: theme.typography.sizes.md,
  },
  // Figures of one width: an amount that Realtime changes does not jump (T9, emil-design-eng).
  value: {
    fontSize: theme.typography.sizes.xxl,
    fontWeight: theme.typography.weights.bold,
    fontVariant: ["tabular-nums"],
  },
});

const BACKGROUND = StyleSheet.create({
  accent: { backgroundColor: theme.colors.accent },
  surface: { backgroundColor: theme.colors.surface },
  light: { backgroundColor: theme.colors.text },
});

const TITLE = StyleSheet.create({
  accent: { color: theme.colors.text },
  surface: { color: theme.colors.textSecondary },
  primary: { color: theme.colors.text },
  light: { color: theme.colors.black },
});

const VALUE = StyleSheet.create({
  accent: { color: theme.colors.text },
  surface: { color: theme.colors.text },
  primary: { color: theme.colors.text },
  light: { color: theme.colors.black },
});

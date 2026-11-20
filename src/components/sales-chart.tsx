import { LinearGradient } from "expo-linear-gradient";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { FilterChips } from "@/components/filter-chips";
import { periodText, salesBars, type SalesBar, type SalesPeriod, type SalesRow } from "@/logic/admin-dashboard";
import { formatMaples, formatPacks } from "@/logic/stock";
import { theme } from "@/theme";

/** The tallest bar (the best seller) and the thin line of a type that sold nothing. */
export const BAR_MAX_HEIGHT = 112;
export const BAR_MIN_HEIGHT = 4;
/** With one or two types, a bar keeps a bar's width instead of filling the card (T9). */
export const BAR_COLUMN_MAX_WIDTH = 88;

const PERIODS = [
  { value: "week", label: "Semana" },
  { value: "month", label: "Mes" },
  { value: "year", label: "Año" },
] as const;

type Props = {
  /** The rows of admin_sales_by_type: the three periods come together, so switching asks nothing. */
  rows: readonly SalesRow[];
  period: SalesPeriod;
  onChange: (period: SalesPeriod) => void;
};

// "Ventas por tipo" of the Dashboard (spec 007: RF-7 to RF-12), as the orange card of the Figma: the
// title and what the period counts, a dark bar per type with its height by the eggs sold (the best
// seller black, with "Más vendido"), and below each one its name, maples and packs; at the bottom, the
// chips of the period. Without the number pills of the Figma: the value is already below each bar (brief
// of T4). Each bar is one text for the screen reader. Many types: the row scrolls sideways inside the
// card. White on the gradient: 4.79:1 and more; on the dark bars and chips, 9.82:1.
export function SalesChart({ rows, period, onChange }: Props) {
  const result = salesBars(rows, period);
  return (
    <LinearGradient
      colors={[theme.colors.primary, theme.colors.primaryGradientEnd]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.card}
    >
      <View>
        <Text style={styles.title} accessibilityRole="header">
          Ventas por tipo
        </Text>
        <Text style={styles.subtitle}>{`Maples y packs vendidos ${periodText(period)}`}</Text>
      </View>
      {result.kind === "empty" ? (
        <Text style={styles.empty}>{`Sin ventas ${periodText(period)}`}</Text>
      ) : (
        <ScrollView
          testID="sales-bars"
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.bars}
        >
          {result.bars.map((bar) => (
            <Bar key={bar.id} bar={bar} />
          ))}
        </ScrollView>
      )}
      <FilterChips label="Período" tone="onPrimary" options={PERIODS} value={period} onChange={onChange} />
    </LinearGradient>
  );
}

function Bar({ bar }: { bar: SalesBar }) {
  const maples = formatMaples(bar.eggs);
  const packs = formatPacks(bar.eggs);
  const label = [bar.name, maples, packs, bar.best ? "más vendido" : null].filter(Boolean).join(", ");
  return (
    <View accessible accessibilityLabel={label} style={styles.column}>
      <View style={styles.plot}>
        {bar.best && (
          // One line, shrinking with large text: the plot has a fixed height for every bar (T9).
          <Text style={styles.best} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
            Más vendido
          </Text>
        )}
        <View
          testID={`bar-${bar.id}`}
          style={[
            styles.bar,
            bar.best && styles.barBest,
            { height: Math.max(BAR_MIN_HEIGHT, bar.ratio * BAR_MAX_HEIGHT) },
          ]}
        />
      </View>
      <Text style={styles.name} numberOfLines={2}>
        {bar.name}
      </Text>
      <Text style={styles.value}>{maples}</Text>
      <Text style={styles.value}>{packs}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: theme.radii.xl,
    padding: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  title: {
    color: theme.colors.text,
    fontSize: theme.typography.sizes.lg,
    fontWeight: theme.typography.weights.semibold,
  },
  subtitle: {
    color: theme.colors.text,
    fontSize: theme.typography.sizes.xs,
  },
  empty: {
    color: theme.colors.text,
    fontSize: theme.typography.sizes.md,
    paddingVertical: theme.spacing.xxxl,
    textAlign: "center",
  },
  // Up to 4 bars share the card; more scroll sideways, each at least 64 pt wide. With fewer, each stops
  // at 88 pt and they are spread across the card.
  bars: {
    flexGrow: 1,
    justifyContent: "space-around",
    gap: theme.spacing.sm,
  },
  column: {
    flex: 1,
    minWidth: 64,
    maxWidth: BAR_COLUMN_MAX_WIDTH,
    alignItems: "center",
  },
  plot: {
    alignSelf: "stretch",
    // The "Más vendido" label sits on top of the tallest bar.
    height: BAR_MAX_HEIGHT + theme.spacing.xl,
    justifyContent: "flex-end",
    alignItems: "center",
    gap: theme.spacing.xs,
  },
  bar: {
    alignSelf: "stretch",
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.primaryShade,
  },
  barBest: {
    backgroundColor: theme.colors.black,
  },
  best: {
    color: theme.colors.text,
    fontSize: theme.typography.sizes.xs,
    fontWeight: theme.typography.weights.semibold,
  },
  name: {
    marginTop: theme.spacing.sm,
    color: theme.colors.text,
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.semibold,
    textAlign: "center",
  },
  value: {
    color: theme.colors.text,
    fontSize: theme.typography.sizes.xs,
    textAlign: "center",
  },
});

import { StyleSheet, Text, View } from "react-native";

import { inventoryRows, type StockType } from "@/logic/admin-dashboard";
import { formatMaples, formatMaplesAndPacks, formatPacks } from "@/logic/stock";
import { theme } from "@/theme";

const PALETTE = theme.colors.categories;

// "Inventario" of the Dashboard (spec 007, RF-13): per active type, in their order, the name and the
// physical stock (reserved eggs included) in maples and packs, and below a bar of the color of the type,
// as long as its stock against the type with most. Unlike the Figma, the texts go above the bar and not
// inside it: a short bar leaves no room for the name, and white on the light category colors does not
// reach 4.5:1; above, they are always white on the dark background. Each row is one text for the screen
// reader. The exact eggs and the shortfall stay in Productos · Stock.
export function InventoryBars({ types }: { types: readonly StockType[] }) {
  const rows = inventoryRows(types, PALETTE.length);
  return (
    <View style={styles.section}>
      <Text style={styles.title} accessibilityRole="header">
        Inventario
      </Text>
      {rows.length === 0 ? (
        <Text style={styles.empty}>No hay tipos activos</Text>
      ) : (
        rows.map((row) => (
          <View
            key={row.id}
            accessible
            accessibilityLabel={`${row.name}, ${formatMaples(row.stock)}, ${formatPacks(row.stock)}`}
            style={styles.row}
          >
            <View style={styles.texts}>
              <Text style={styles.name} numberOfLines={1}>
                {row.name}
              </Text>
              <Text style={styles.value}>{formatMaplesAndPacks(row.stock)}</Text>
            </View>
            <View style={styles.track}>
              <View
                testID={`stock-bar-${row.id}`}
                style={[styles.fill, { width: `${row.ratio * 100}%`, backgroundColor: PALETTE[row.colorIndex] }]}
              />
            </View>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: theme.spacing.lg,
  },
  title: {
    color: theme.colors.text,
    fontSize: theme.typography.sizes.lg,
    fontWeight: theme.typography.weights.semibold,
  },
  empty: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.sizes.md,
  },
  row: {
    gap: theme.spacing.sm,
  },
  texts: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: theme.spacing.md,
  },
  name: {
    flex: 1,
    color: theme.colors.text,
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.semibold,
  },
  value: {
    color: theme.colors.text,
    fontSize: theme.typography.sizes.sm,
  },
  track: {
    height: 12,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.surface,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: theme.radii.pill,
  },
});

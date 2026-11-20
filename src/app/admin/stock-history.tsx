import { StyleSheet, Text, View } from "react-native";

import { ListState } from "@/components/list-state";
import { PageScreen } from "@/components/page-screen";
import { useStockHistory, type StockHistoryMovement } from "@/lib/catalog";
import { formatTime, groupByBuenosAiresDay } from "@/logic/dates";
import { movementText } from "@/logic/stock";
import { theme } from "@/theme";

// "Historial de stock" (spec 011: RF-10 to RF-15), opened from the menu of the admin Perfil: the last 50
// loads and adjustments of every type, archived ones too, by Buenos Aires day, newest first. Sales are
// left out (they are in the history of the Dashboard). Movements are only shown: a mistake is fixed with
// a new movement (spec 003, RF-24). It refreshes when it opens, when the app comes to the foreground
// (QueryProvider) and when it is pulled down; each render takes "now" again, so "Hoy" and "Ayer" are
// right after every refresh (RF-15).
export default function StockHistory() {
  const history = useStockHistory();
  const days = groupByBuenosAiresDay(history.data ?? [], (movement) => movement.created_at, new Date());

  return (
    <PageScreen title="Historial de stock" onRefresh={() => void history.refetch()} refreshing={history.isRefetching}>
      <ListState
        loading={history.isPending}
        error={history.isError ? "No pudimos cargar el historial" : null}
        empty={history.data?.length === 0 ? "Todavía no hay cargas ni ajustes" : null}
        onRetry={() => history.refetch()}
      >
        {days.map((day) => (
          <View key={day.title} style={styles.day}>
            {/* A header, so a screen reader jumps from day to day (as OrderHistory). */}
            <Text style={styles.dayTitle} accessibilityRole="header">
              {day.title}
            </Text>
            {day.items.map((movement) => (
              <MovementRow key={movement.id} movement={movement} />
            ))}
          </View>
        ))}
      </ListState>
    </PageScreen>
  );
}

/**
 * RF-12: the current name of the type, the movement, the Buenos Aires time and the note or reason. One
 * element for the screen reader, which reads its texts in a row (impeccable audit).
 */
function MovementRow({ movement }: { movement: StockHistoryMovement }) {
  return (
    <View testID={`movement-${movement.id}`} accessible style={styles.row}>
      <Text style={styles.title}>{movement.egg_types.name}</Text>
      <Text style={styles.movement}>{movementText(movement)}</Text>
      <Text style={styles.detail}>{formatTime(new Date(movement.created_at))}</Text>
      {movement.note ? <Text style={styles.detail}>{movement.note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  day: {
    gap: theme.spacing.sm,
  },
  dayTitle: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.sizes.md,
  },
  row: {
    gap: 2,
    padding: theme.spacing.lg,
    borderRadius: theme.radii.lg,
    backgroundColor: theme.colors.surface,
  },
  title: {
    color: theme.colors.text,
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.semibold,
  },
  movement: {
    color: theme.colors.text,
    fontSize: theme.typography.sizes.md,
  },
  detail: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.sizes.sm,
  },
});

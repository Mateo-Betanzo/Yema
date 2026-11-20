import { StyleSheet, Text, View } from "react-native";

import { ProductRow } from "@/components/product-row";
import type { OrderStatus } from "@/logic/admin-orders";
import type { HistorySection } from "@/logic/client-orders";
import { formatARS } from "@/logic/currency";
import { theme } from "@/theme";

type HistoryOrder = { id: number; status: OrderStatus; total: number };

type Props<T extends HistoryOrder> = {
  /** The finished orders by day, from historySections. */
  sections: readonly HistorySection<T>[];
  /** What to say when there are no orders ("Todavía no tenés compras"). */
  empty: string;
  /** The title and the lines of a row: each screen says what it shows (the summary, the client, the status). */
  describe: (order: T) => { title: string; lines: readonly string[] };
  onOpen: (order: T) => void;
};

// The history of finished orders by day, shared by the client Home (spec 006: RF-18 to RF-21) and the
// Dashboard of the admin (spec 007: RF-14, RF-15, RF-18): a grey header per day (a header, so a screen
// reader jumps from day to day) and a ProductRow per order with its total on the right, grey when it was
// not charged (rejected or cancelled). Touching a row opens its order.
export function OrderHistory<T extends HistoryOrder>({ sections, empty, describe, onOpen }: Props<T>) {
  if (sections.length === 0) return <Text style={styles.empty}>{empty}</Text>;
  return sections.map((day) => (
    <View key={day.title} style={styles.day}>
      <Text style={styles.dayTitle} accessibilityRole="header">
        {day.title}
      </Text>
      {day.orders.map((order) => {
        const { title, lines } = describe(order);
        return (
          <ProductRow
            key={order.id}
            title={title}
            lines={lines}
            amount={formatARS(order.total)}
            amountMuted={order.status !== "delivered"}
            onPress={() => onOpen(order)}
          />
        );
      })}
    </View>
  ));
}

const styles = StyleSheet.create({
  day: {
    gap: theme.spacing.sm,
  },
  dayTitle: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.sizes.md,
  },
  empty: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.sizes.md,
  },
});

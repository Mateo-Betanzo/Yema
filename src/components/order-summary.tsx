import Feather from "@expo/vector-icons/Feather";
import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { isAppOrder } from "@/logic/admin-orders";
import { formatARS } from "@/logic/currency";
import { formatDayKey } from "@/logic/dates";
import { formatSlot } from "@/logic/delivery";
import { theme } from "@/theme";

type Item = { name: string | null; quantity: number; unit_price: number };

type Props = {
  order: {
    /** A counter sale (spec 008) has no address, day nor slot. */
    address: string | null;
    address_notes: string | null;
    delivery_date: string | null;
    slot_starts_at: string | null;
    slot_ends_at: string | null;
    total: number;
    items: readonly Item[];
  };
  now: Date;
  /** How it is paid: "Paga al recibir" for an order of the app, "Pagó en efectivo" for a counter sale. */
  payment?: string;
};

// What an order is, as the "Nuevo pedido" card of the Figma: the address with its notes, the day and
// slot, the numbered lines with their subtotal at the price saved with the order, "Paga al recibir" and
// the total. Shared by the order detail of the admin (spec 005, RF-7) and of the client (spec 006,
// RF-22). A line without a name (the admin view gives none to a client) still reads as a product. A
// counter sale (spec 008, RF-17) has no address card and says how it was paid.
export function OrderSummary({ order, now, payment = "Paga al recibir" }: Props) {
  return (
    <>
      {isAppOrder(order) ? (
        <Card testID="order-address">
          <View style={styles.address}>
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <Feather name="map-pin" size={20} color={theme.colors.text} />
            </View>
            <View style={styles.texts}>
              <Text style={styles.text}>{order.address}</Text>
              {order.address_notes ? <Text style={styles.secondary}>{order.address_notes}</Text> : null}
              <Text style={styles.secondary}>
                {`${formatDayKey(order.delivery_date, now)} · ${formatSlot(order.slot_starts_at, order.slot_ends_at)}`}
              </Text>
            </View>
          </View>
        </Card>
      ) : null}

      <View style={styles.lines}>
        <Text style={styles.label}>PEDIDO</Text>
        {order.items.map((item, index) => {
          const line = `${index + 1} · ${item.name ?? "Producto"} ×${item.quantity}`;
          const subtotal = formatARS(item.quantity * item.unit_price);
          return (
            <View key={index} style={styles.line} accessible accessibilityLabel={`${line}, ${subtotal}`}>
              <Text style={styles.lineName}>{line}</Text>
              <Text style={styles.text}>{subtotal}</Text>
            </View>
          );
        })}
      </View>

      <View style={styles.row}>
        <Card style={styles.half}>
          <Text style={styles.label}>PAGO</Text>
          <Text style={styles.text}>{payment}</Text>
        </Card>
        <Card style={styles.half}>
          <View accessible accessibilityLabel={`Total ${formatARS(order.total)}`}>
            <Text style={styles.label}>TOTAL</Text>
            <Text style={styles.total}>{formatARS(order.total)}</Text>
          </View>
        </Card>
      </View>
    </>
  );
}

function Card({ children, style, testID }: { children: ReactNode; style?: object; testID?: string }) {
  return (
    <View testID={testID} style={[styles.card, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: theme.spacing.xs,
    padding: theme.spacing.lg,
    borderRadius: theme.radii.lg,
    backgroundColor: theme.colors.surface,
  },
  address: {
    flexDirection: "row",
    gap: theme.spacing.md,
  },
  texts: {
    flex: 1,
    gap: 2,
  },
  lines: {
    gap: theme.spacing.sm,
  },
  label: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.sizes.xs,
    fontWeight: theme.typography.weights.semibold,
  },
  line: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.radii.lg,
    backgroundColor: theme.colors.surface,
  },
  lineName: {
    flex: 1,
    color: theme.colors.text,
    fontSize: theme.typography.sizes.md,
  },
  row: {
    flexDirection: "row",
    gap: theme.spacing.md,
  },
  half: {
    flex: 1,
  },
  text: {
    color: theme.colors.text,
    fontSize: theme.typography.sizes.md,
  },
  secondary: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.sizes.sm,
  },
  total: {
    color: theme.colors.text,
    fontSize: theme.typography.sizes.xl,
    fontWeight: theme.typography.weights.bold,
  },
});

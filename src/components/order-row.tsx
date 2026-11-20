import { Pressable, StyleSheet, Text, View } from "react-native";

import type { AdminOrder, AppAdminOrder } from "@/lib/admin-orders";
import { orderFlag, shortClientName, statusLabel } from "@/logic/admin-orders";
import { formatProductCount } from "@/logic/cart";
import { formatARS } from "@/logic/currency";
import { theme } from "@/theme";

/** "Rocío Fernández", or "Cliente" when the profile cannot be read. */
export function clientName(order: Pick<AdminOrder, "client_first_name" | "client_last_name">): string {
  return [order.client_first_name, order.client_last_name].filter(Boolean).join(" ") || "Cliente";
}

/** The section of the admin Home a row belongs to: it sets its color (RF-28). */
export type OrderRowTone = "fresh" | "today" | "upcoming";

// RF-28: Nuevos orange, Para hoy white, Próximos dark grey, as the Figma of 2026-11-19. The Figma's
// orange (#f35b2c) gives 3:1 with white, so it is primary (4.79:1); the total goes in the color of the
// text of the row (the Figma's grey does not reach 4.5:1 on orange).
const TONES: Record<OrderRowTone, { background: string; text: string }> = {
  fresh: { background: theme.colors.primary, text: theme.colors.text },
  today: { background: theme.colors.text, text: theme.colors.black },
  upcoming: { background: theme.colors.rowMuted, text: theme.colors.text },
};

// An order of the admin Home (spec 005; RF-3, RF-25, RF-28 to RF-30, cambio del 2026-11-19), the
// one-line pill of the Figma: "#12 ·", "Rocío F.", the mark when late or expired, and the total; without
// the Figma's dark box (the author took it out). Only the name is cut ("…") when the line is short; the
// rest never. The units, the day, the slot and the status are in the detail (RF-7); a screen reader hears
// the whole order.
export function OrderRow({
  order,
  now,
  tone,
  onPress,
}: {
  order: AppAdminOrder;
  now: Date;
  tone: OrderRowTone;
  onPress: () => void;
}) {
  const flag = orderFlag(order, now);
  const color = TONES[tone];
  const text = { color: color.text };
  const label = [
    `Pedido #${order.id} de ${clientName(order)}`,
    formatProductCount(order.units ?? 0),
    formatARS(order.total),
    statusLabel(order.status),
    flag?.label,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.row, { backgroundColor: color.background }, pressed && styles.pressed]}
    >
      <View style={styles.texts}>
        <Text style={[styles.number, text]}>{`#${order.id} ·`}</Text>
        <Text style={[styles.name, text]} numberOfLines={1}>
          {shortClientName(order)}
        </Text>
        {flag && <Text style={[styles.flag, text]}>{`· ${flag.label}`}</Text>}
      </View>
      <Text style={[styles.total, text]}>{formatARS(order.total)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // A pill of 48 pt (the Figma's "Item pedido"); it grows with the system text size.
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    minHeight: 48,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radii.pill,
  },
  pressed: {
    opacity: 0.7,
  },
  // The number, the name (the only part that shrinks) and the mark, on one line.
  texts: {
    flex: 1,
    flexDirection: "row",
    alignItems: "baseline",
    gap: theme.spacing.xs,
  },
  number: {
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.semibold,
  },
  name: {
    flexShrink: 1,
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.semibold,
  },
  flag: {
    fontSize: theme.typography.sizes.sm,
  },
  total: {
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.semibold,
  },
});

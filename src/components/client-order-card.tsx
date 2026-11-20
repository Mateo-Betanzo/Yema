import Feather from "@expo/vector-icons/Feather";
import { LinearGradient } from "expo-linear-gradient";
import { useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { TimelineBar } from "@/components/order-timeline";
import type { ClientOrder } from "@/lib/client-orders";
import { cardCopy, timelineLabel, type HomeCard } from "@/logic/client-orders";
import { formatARS } from "@/logic/currency";
import { formatDayKey } from "@/logic/dates";
import { formatSlot } from "@/logic/delivery";
import { theme } from "@/theme";

type Props = {
  card: HomeCard<ClientOrder>;
  now: Date;
  onOpen: (order: ClientOrder) => void;
  onHide: (order: ClientOrder) => void;
};

// The top of the client Home (spec 006: RF-2 to RF-4, RF-10 to RF-12, RF-24), the orange card of the
// Figma. The active order: its status, a text without dates, the number, day, slot and total, and the
// four-step bar. A finished order of the last 7 days: its status, the number, the reason if it has one,
// the whole bar only if it was delivered, and "Ocultar". The whole card opens the order; "Ocultar" sits
// outside that button so a screen reader reaches it on its own. Nothing to show: no card at all, the
// Shop starts right below the greeting (spec 010, RF-3, which replaces RF-12 of the 006).
export function ClientOrderCard({ card, now, onOpen, onHide }: Props) {
  // The whole card presses in, not only its texts: the gradient wraps the button and "Ocultar".
  const [pressed, setPressed] = useState(false);

  if (card.kind === "empty") return null;

  const { order } = card;
  const finished = card.kind === "finished";
  const { title, text } = cardCopy(order);
  const when = `${formatDayKey(order.delivery_date, now)} · ${formatSlot(order.slot_starts_at, order.slot_ends_at)}`;
  const meta = finished ? `#${order.id}` : `#${order.id} · ${when} · ${formatARS(order.total)}`;
  const step = timelineLabel(order.status);
  const label = [title, text, meta, step].filter(Boolean).join(", ");

  return (
    <LinearGradient
      colors={[theme.colors.primary, theme.colors.primaryGradientEnd]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      testID="client-order-card"
      style={[styles.card, pressed && styles.cardPressed]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => onOpen(order)}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        style={[styles.main, finished && styles.roomForHide]}
      >
        <Text style={styles.title}>{title}</Text>
        {text ? <Text style={styles.text}>{text}</Text> : null}
        <Text style={styles.meta}>{meta}</Text>
        <TimelineBar status={order.status} />
      </Pressable>
      {finished ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ocultar"
          onPress={() => onHide(order)}
          hitSlop={theme.spacing.xs}
          style={({ pressed }) => [styles.hide, pressed && styles.hidePressed]}
        >
          <Feather name="x" size={24} color={theme.colors.text} />
        </Pressable>
      ) : null}
    </LinearGradient>
  );
}

const HIDE_SIZE = 48;

const styles = StyleSheet.create({
  card: {
    borderRadius: theme.radii.xl,
    overflow: "hidden",
  },
  main: {
    gap: theme.spacing.sm,
    padding: theme.spacing.xl,
  },
  // The title never runs under "Ocultar".
  roomForHide: {
    paddingRight: theme.spacing.xl + HIDE_SIZE,
  },
  // Press feedback as the other surfaces: a slight press-in, like CartBar (the card) and RoundButton
  // ("Ocultar"); emil-design-eng, T10.
  cardPressed: {
    transform: [{ scale: 0.98 }],
  },
  hidePressed: {
    transform: [{ scale: 0.94 }],
  },
  title: {
    color: theme.colors.text,
    fontSize: theme.typography.sizes.xl,
    fontWeight: theme.typography.weights.bold,
  },
  text: {
    color: theme.colors.text,
    fontSize: theme.typography.sizes.md,
  },
  meta: {
    color: theme.colors.text,
    fontSize: theme.typography.sizes.sm,
    marginBottom: theme.spacing.xs,
  },
  hide: {
    position: "absolute",
    top: theme.spacing.sm,
    right: theme.spacing.sm,
    width: HIDE_SIZE,
    height: HIDE_SIZE,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radii.pill,
  },
});

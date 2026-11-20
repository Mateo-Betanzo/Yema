import { router } from "expo-router";
import { useRef, useState, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { FormAlert } from "@/components/auth-form-screen";
import { FilterChips } from "@/components/filter-chips";
import { ListState } from "@/components/list-state";
import { Notice } from "@/components/notice";
import { PageScreen } from "@/components/page-screen";
import { PrimaryButton } from "@/components/primary-button";
import { useCart } from "@/lib/cart";
import { useShopProducts } from "@/lib/catalog";
import { useActiveOrder, useCreateOrder, useDeliveryOptions } from "@/lib/orders";
import { useSession } from "@/lib/session";
import { cartLines, cartSummary, lineIssueText, orderItems } from "@/logic/cart";
import { formatARS } from "@/logic/currency";
import { formatDayKey } from "@/logic/dates";
import { deliveryDays, groupSlotsByDay } from "@/logic/delivery";
import { orderErrorKind, orderErrorMessage } from "@/logic/order-errors";
import { theme } from "@/theme";

// The checkout (spec 004: RF-20 to RF-28, RF-31, RF-32), opened from the cart. The order, the address
// of the profile, cash on delivery, and the day and slot from delivery_options(). The base decides
// everything when confirming (create_order); errors keep the cart and the slot, except a slot that is
// gone, which is unselected (RF-28). No Figma: sections in a column, the days and slots as the chips of
// the Shop (brief confirmed on 2026-11-11).
export default function Checkout() {
  const products = useShopProducts();
  const options = useDeliveryOptions();
  const activeOrder = useActiveOrder();
  const createOrder = useCreateOrder();
  const { profile } = useSession();
  const cart = useCart();

  const [chosenDay, setChosenDay] = useState<string | null>(null);
  const [slotId, setSlotId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  // One order per tap: isPending only updates on the next render, so a quick second tap would send again.
  const sending = useRef(false);

  const lines = cartLines(cart.items, products.data ?? undefined);
  const summary = cartSummary(lines);
  const now = new Date();
  const days = groupSlotsByDay(deliveryDays(now), options.data ?? []);
  // Until the client picks a day, the first one with a free slot (RF-21).
  const day = days.find((group) => group.date === chosenDay) ?? days.find((group) => group.hasChoice);
  const hasActiveOrder = Boolean(activeOrder.data);
  // The chosen slot counts only while the refreshed slots still offer it with room (RF-3, RF-28).
  const slot = day?.slots.find((candidate) => candidate.id === slotId && !candidate.full);

  function chooseDay(date: string | null) {
    setChosenDay(date);
    setSlotId(null);
  }

  async function confirm() {
    if (!day || !slot || sending.current) return;
    sending.current = true;
    setError(null);
    try {
      const order = await createOrder.mutateAsync({
        deliveryDate: day.date,
        slotId: slot.id,
        items: orderItems(cart.items),
        expectedTotal: summary.total,
      });
      cart.clear();
      router.replace({
        pathname: "/client/order-confirmed",
        params: { date: order.delivery_date, startsAt: order.starts_at, endsAt: order.ends_at, total: String(order.total) },
      });
    } catch (failure) {
      setError(orderErrorMessage(failure));
      // RF-28: the slot is gone; the refreshed slots (useCreateOrder refreshes them) show the others.
      if (orderErrorKind(failure) === "slot") setSlotId(null);
    } finally {
      sending.current = false;
    }
  }

  const canConfirm = slot !== undefined && !hasActiveOrder && summary.canContinue;

  return (
    <PageScreen title="Confirmar pedido">
      {hasActiveOrder && <Notice message="Ya tenés un pedido en curso" />}

      <Section title="Tu pedido">
        {lines.map((line) => {
          const issue = lineIssueText(line);
          return (
            <View key={line.productId}>
              <View style={styles.row}>
                <Text style={styles.item}>{`${line.quantity} × ${line.name}`}</Text>
                {line.price !== null && <Text style={styles.amount}>{formatARS(line.subtotal)}</Text>}
              </View>
              {issue !== null && <Text style={styles.issue}>{issue}</Text>}
            </View>
          );
        })}
        <View style={styles.row} accessible accessibilityLabel={`Total ${formatARS(summary.total)}`}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.total}>{formatARS(summary.total)}</Text>
        </View>
        {!summary.canContinue && cart.items.length > 0 && (
          <View style={styles.review}>
            <Text style={styles.reviewText}>Hay productos para revisar en tu carrito</Text>
            <PrimaryButton title="Revisar carrito" variant="outline" onPress={() => router.back()} />
          </View>
        )}
      </Section>

      <Section title="Entrega">
        <Text style={styles.text}>{profile?.address}</Text>
        {profile?.address_notes ? <Text style={styles.secondary}>{profile.address_notes}</Text> : null}
      </Section>

      <ListState
        loading={options.isPending}
        error={options.isError ? "No pudimos cargar los horarios de entrega" : null}
        empty={day === undefined ? "No hay horarios de entrega esta semana" : null}
        onRetry={() => options.refetch()}
      >
        {day && (
          <>
            <Section title="Día">
              <FilterChips
                label="Día"
                value={day.date}
                onChange={chooseDay}
                options={days.map((group) => {
                  const label = formatDayKey(group.date, now);
                  return group.hasChoice
                    ? { value: group.date, label }
                    : { value: group.date, label: `${label} · Sin horarios`, disabled: true };
                })}
              />
            </Section>
            <Section title="Horario">
              <FilterChips
                label="Horario"
                value={slotId}
                onChange={setSlotId}
                options={day.slots.map((slot) =>
                  slot.full ? { value: slot.id, label: `${slot.label} · Completa`, disabled: true } : { value: slot.id, label: slot.label },
                )}
              />
            </Section>
          </>
        )}
      </ListState>

      <Section title="Pago">
        <Text style={styles.text}>Efectivo al recibir</Text>
      </Section>

      <FormAlert message={error} />
      <PrimaryButton
        title="Confirmar pedido"
        onPress={confirm}
        loading={createOrder.isPending}
        disabled={!canConfirm}
      />
    </PageScreen>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: theme.spacing.sm,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.sizes.lg,
    fontWeight: theme.typography.weights.semibold,
  },
  row: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: theme.spacing.md,
  },
  item: {
    flex: 1,
    color: theme.colors.text,
    fontSize: theme.typography.sizes.md,
  },
  amount: {
    color: theme.colors.text,
    fontSize: theme.typography.sizes.md,
  },
  issue: {
    color: theme.colors.text,
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.semibold,
  },
  totalLabel: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.sizes.md,
  },
  total: {
    color: theme.colors.text,
    fontSize: theme.typography.sizes.xl,
    fontWeight: theme.typography.weights.bold,
  },
  review: {
    gap: theme.spacing.md,
    marginTop: theme.spacing.sm,
  },
  reviewText: {
    color: theme.colors.text,
    fontSize: theme.typography.sizes.sm,
  },
  text: {
    color: theme.colors.text,
    fontSize: theme.typography.sizes.md,
  },
  secondary: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.sizes.sm,
  },
});

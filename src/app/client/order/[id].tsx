import { useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { Alert, StyleSheet, Text } from "react-native";

import { FormAlert } from "@/components/auth-form-screen";
import { ListState } from "@/components/list-state";
import { OrderSummary } from "@/components/order-summary";
import { TimelineSteps } from "@/components/order-timeline";
import { PageScreen } from "@/components/page-screen";
import { PrimaryButton } from "@/components/primary-button";
import { useCancelOrder, useClientOrder, type ClientOrder } from "@/lib/client-orders";
import { cardCopy, reasonText } from "@/logic/client-orders";
import { orderStatusErrorKind, orderStatusErrorMessage } from "@/logic/order-status-errors";
import { theme } from "@/theme";

// The order detail of the client (spec 006: RF-4 to RF-9, RF-21 to RF-25), a modal screen over the Home,
// as the brief confirmed in T6: the status and why it ended (the reason of the admin, or "Cancelaste
// este pedido"), the timeline with the date and time of each step, the order (OrderSummary, shared with
// the admin's detail) and, only while it is pending, "Cancelar pedido". The base decides whether it can
// still be cancelled (cancel_order); after a cancellation the detail stays open and shows the order
// cancelled, because the query is refreshed before the change resolves.
export default function ClientOrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const order = useClientOrder(Number(id));

  return (
    <PageScreen title={`Pedido #${id}`}>
      <ListState
        loading={order.isPending}
        error={order.isError ? "No pudimos cargar el pedido" : null}
        empty={order.data === null ? "No encontramos este pedido" : null}
        onRetry={() => order.refetch()}
      >
        {order.data ? <OrderDetail order={order.data} onChanged={() => order.refetch()} /> : null}
      </ListState>
    </PageScreen>
  );
}

function OrderDetail({ order, onChanged }: { order: ClientOrder; onChanged: () => void }) {
  const cancelOrder = useCancelOrder();
  const [error, setError] = useState<string | null>(null);
  // One cancellation per tap: isPending only updates on the next render.
  const sending = useRef(false);
  const { title } = cardCopy(order);
  const reason = reasonText(order);

  async function cancel() {
    if (sending.current) return;
    sending.current = true;
    setError(null);
    try {
      await cancelOrder.mutateAsync(order.id);
    } catch (failure) {
      setError(orderStatusErrorMessage(failure));
      // RF-8: show what the order is now (the admin accepted it, for example).
      if (orderStatusErrorKind(failure) === "changed") onChanged();
    } finally {
      sending.current = false;
    }
  }

  // RF-6: the system confirmation, as the limits of the cart (spec 004); no reason to type.
  function confirm() {
    Alert.alert(`¿Cancelar el pedido #${order.id}?`, undefined, [
      { text: "No, volver", style: "cancel" },
      { text: "Sí, cancelar", style: "destructive", onPress: () => void cancel() },
    ]);
  }

  return (
    <>
      <Text style={styles.status}>{title}</Text>
      {reason ? <Text style={styles.reason}>{reason}</Text> : null}
      <TimelineSteps order={order} />
      <OrderSummary order={order} now={new Date()} />
      <FormAlert message={error} />
      {order.status === "pending" ? (
        <PrimaryButton title="Cancelar pedido" variant="outline" loading={cancelOrder.isPending} onPress={confirm} />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  status: {
    color: theme.colors.text,
    fontSize: theme.typography.sizes.lg,
    fontWeight: theme.typography.weights.semibold,
  },
  reason: {
    color: theme.colors.text,
    fontSize: theme.typography.sizes.md,
  },
});

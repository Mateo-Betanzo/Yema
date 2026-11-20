import * as Linking from "expo-linking";
import { router, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";

import { FormAlert } from "@/components/auth-form-screen";
import { ListState } from "@/components/list-state";
import { clientName } from "@/components/order-row";
import { OrderSummary } from "@/components/order-summary";
import { PageScreen } from "@/components/page-screen";
import { PrimaryButton } from "@/components/primary-button";
import { TextField } from "@/components/text-field";
import { useAdminOrder, useSetOrderStatus, type AdminOrder } from "@/lib/admin-orders";
import { formatElapsed, orderActions, statusLabel, type OrderAction } from "@/logic/admin-orders";
import { formatStepTime } from "@/logic/client-orders";
import { callUrl, whatsappUrl } from "@/logic/contact";
import { orderStatusErrorKind, orderStatusErrorMessage, validateReason } from "@/logic/order-status-errors";
import { theme } from "@/theme";

type Item = { name: string | null; quantity: number; unit_price: number };

// The order detail of the admin (spec 005: RF-7 to RF-17, RF-19, RF-26), a modal screen
// over the Home with the content of the "Nuevo pedido" card of the Figma: status and how long ago, the
// client with "Llamar" and "WhatsApp", the address with the day and slot, the numbered lines, payment
// and total, and the two actions of the status. Rejecting and cancelling go through a confirmation with
// the reason (optional to reject, required to cancel, RF-16, RF-19). The base decides every change
// (set_order_status); a change that works closes the detail and the Home shows the order in its new
// section. Spec 006: the address, lines, payment and total are OrderSummary (shared with the client's
// detail), and an order the client cancelled says "Lo canceló el cliente" (RF-31). Spec 008: a counter
// sale has its own short detail (RF-17).
export default function AdminOrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const order = useAdminOrder(Number(id));

  return (
    <PageScreen title={`Pedido #${id}`}>
      <ListState
        loading={order.isPending}
        error={order.isError ? "No pudimos cargar el pedido" : null}
        empty={order.data === null ? "Este pedido ya no existe" : null}
        onRetry={() => order.refetch()}
      >
        {order.data?.counter_sale ? (
          <CounterSaleDetail order={order.data} />
        ) : order.data ? (
          <OrderDetail order={order.data} onChanged={() => order.refetch()} />
        ) : null}
      </ListState>
    </PageScreen>
  );
}

// Spec 008, RF-17: a counter sale was born delivered and paid, with no client, address nor slot: who
// bought if it was written down, when, its lines and its total. No contact and no actions.
function CounterSaleDetail({ order }: { order: AdminOrder }) {
  const items = (order.items ?? []) as Item[];
  return (
    <>
      <Text style={styles.status}>Venta en el local</Text>
      {order.customer_name ? <Text style={styles.name}>{order.customer_name}</Text> : null}
      {order.delivered_at ? (
        <Text style={styles.secondary}>{`${statusLabel("delivered")} · ${formatStepTime(order.delivered_at)}`}</Text>
      ) : null}
      <OrderSummary order={{ ...order, items }} now={new Date()} payment="Pagó en efectivo" />
    </>
  );
}

function OrderDetail({ order, onChanged }: { order: AdminOrder; onChanged: () => void }) {
  const setStatus = useSetOrderStatus();
  const [error, setError] = useState<string | null>(null);
  // RF-19: the rejection or cancellation being confirmed, with its reason.
  const [confirming, setConfirming] = useState<OrderAction | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | undefined>(undefined);
  // One change per tap: isPending only updates on the next render.
  const sending = useRef(false);
  const now = new Date();
  const name = clientName(order);
  const items = (order.items ?? []) as Item[];

  async function open(url: string | null, app: string) {
    if (!url) return;
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert(`No pudimos abrir ${app}`);
    }
  }

  function startConfirming(action: OrderAction) {
    setError(null);
    setReason("");
    setReasonError(undefined);
    setConfirming(action);
  }

  async function change(action: OrderAction, reasonText: string | null) {
    if (sending.current) return;
    sending.current = true;
    setError(null);
    try {
      await setStatus.mutateAsync({ orderId: order.id, status: action.status, reason: reasonText });
      router.back();
    } catch (failure) {
      const kind = orderStatusErrorKind(failure);
      if (kind === "reason") {
        setReasonError(orderStatusErrorMessage(failure));
      } else {
        setError(orderStatusErrorMessage(failure));
        setConfirming(null);
      }
      // RF-17: show what the order is now (its actions change with it).
      if (kind === "changed") onChanged();
    } finally {
      sending.current = false;
    }
  }

  function confirm() {
    if (!confirming) return;
    const checked = validateReason(reason, confirming.reason === "required");
    if (!checked.ok) {
      setReasonError(checked.error);
      return;
    }
    void change(confirming, checked.reason);
  }

  return (
    <>
      <Text style={styles.status}>{`${statusLabel(order.status)} · ${formatElapsed(order.created_at, now)}`}</Text>
      {order.cancelled_by === "client" ? (
        <Text style={styles.reason}>Lo canceló el cliente</Text>
      ) : order.status_reason ? (
        <Text style={styles.reason}>{`Motivo: ${order.status_reason}`}</Text>
      ) : null}

      <View style={styles.client}>
        <View style={styles.avatar} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Text style={styles.initial}>{name.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.clientTexts}>
          <Text style={styles.name}>{name}</Text>
          {order.client_phone ? <Text style={styles.secondary}>{order.client_phone}</Text> : null}
        </View>
      </View>
      {order.client_phone ? (
        <View style={styles.row}>
          <View style={styles.half}>
            <PrimaryButton
              title="Llamar"
              accessibilityLabel={`Llamar a ${name}`}
              variant="outline"
              onPress={() => open(callUrl(order.client_phone), "el teléfono")}
            />
          </View>
          <View style={styles.half}>
            <PrimaryButton
              title="WhatsApp"
              accessibilityLabel={`WhatsApp a ${name}`}
              variant="outline"
              onPress={() => open(whatsappUrl(order.client_phone), "WhatsApp")}
            />
          </View>
        </View>
      ) : null}

      <OrderSummary order={{ ...order, items }} now={now} />

      <FormAlert message={error} />
      {confirming ? (
        <View style={styles.confirm}>
          <Text style={styles.question} accessibilityRole="header">
            {`¿${confirming.status === "rejected" ? "Rechazar" : "Cancelar"} el pedido #${order.id}?`}
          </Text>
          <TextField
            label={confirming.reason === "required" ? "Motivo" : "Motivo (opcional)"}
            placeholder={confirming.reason === "required" ? "Motivo" : "Motivo (opcional)"}
            value={reason}
            onChangeText={(text) => {
              setReason(text);
              setReasonError(undefined);
            }}
            error={reasonError}
            maxLength={200}
          />
          <View style={styles.row}>
            <View style={styles.half}>
              <PrimaryButton title="No, volver" variant="outline" disabled={setStatus.isPending} onPress={() => setConfirming(null)} />
            </View>
            <View style={styles.half}>
              <PrimaryButton
                title={confirming.status === "rejected" ? "Confirmar rechazo" : "Confirmar cancelación"}
                loading={setStatus.isPending}
                onPress={confirm}
              />
            </View>
          </View>
        </View>
      ) : (
        orderActions(order.status).length > 0 && (
          <View style={styles.row}>
            {orderActions(order.status).map((action) => (
              <View key={action.status} style={styles.half}>
                <PrimaryButton
                  title={action.label}
                  variant={action.primary ? "primary" : "outline"}
                  loading={action.primary && setStatus.isPending}
                  disabled={setStatus.isPending}
                  onPress={() => (action.reason === "none" ? change(action, null) : startConfirming(action))}
                />
              </View>
            ))}
          </View>
        )
      )}
    </>
  );
}

const AVATAR = 48;

const styles = StyleSheet.create({
  status: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.sizes.md,
  },
  reason: {
    color: theme.colors.text,
    fontSize: theme.typography.sizes.md,
  },
  client: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: theme.radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.accent,
  },
  initial: {
    color: theme.colors.text,
    fontSize: theme.typography.sizes.lg,
    fontWeight: theme.typography.weights.bold,
  },
  clientTexts: {
    flex: 1,
    gap: 2,
  },
  name: {
    color: theme.colors.text,
    fontSize: theme.typography.sizes.lg,
    fontWeight: theme.typography.weights.semibold,
  },
  row: {
    flexDirection: "row",
    gap: theme.spacing.md,
  },
  half: {
    flex: 1,
  },
  confirm: {
    gap: theme.spacing.lg,
  },
  question: {
    color: theme.colors.text,
    fontSize: theme.typography.sizes.lg,
    fontWeight: theme.typography.weights.semibold,
  },
  secondary: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.sizes.sm,
  },
});

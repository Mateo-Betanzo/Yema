import Feather from "@expo/vector-icons/Feather";
import { router, useLocalSearchParams } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { PageScreen } from "@/components/page-screen";
import { PrimaryButton } from "@/components/primary-button";
import { formatARS } from "@/logic/currency";
import { formatDayKey } from "@/logic/dates";
import { formatSlot } from "@/logic/delivery";
import { theme } from "@/theme";

type Params = { date?: string; startsAt?: string; endsAt?: string; total?: string };

// The confirmation of an order (spec 004, RF-31). The checkout replaces itself with this screen and
// passes what create_order returned: the day, the slot and the total computed by the base. No "back"
// (the cart is already empty); "Ver productos" closes the order screens and opens the Home, where the
// Shop and the card of the new order are (spec 010, RF-15).
export default function OrderConfirmed() {
  const { date, startsAt, endsAt, total } = useLocalSearchParams<Params>();
  const amount = Number(total);
  const hasDetails = Boolean(date && startsAt && endsAt) && Number.isSafeInteger(amount);

  return (
    <PageScreen title="¡Pedido confirmado!" back={false}>
      <View style={styles.check} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Feather name="check" size={40} color={theme.colors.text} />
      </View>

      {hasDetails && date && startsAt && endsAt && (
        <View style={styles.card}>
          <Detail label="Día" value={formatDayKey(date, new Date())} />
          <Detail label="Horario" value={formatSlot(startsAt, endsAt)} />
          <View style={styles.row} accessible accessibilityLabel={`Total ${formatARS(amount)}`}>
            <Text style={styles.label}>Total</Text>
            <Text style={styles.total}>{formatARS(amount)}</Text>
          </View>
        </View>
      )}

      <Text style={styles.payment}>Pagás en efectivo al recibir</Text>
      <PrimaryButton title="Ver productos" onPress={() => router.dismissTo("/client")} />
    </PageScreen>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const CHECK_SIZE = 80;

const styles = StyleSheet.create({
  check: {
    alignSelf: "center",
    width: CHECK_SIZE,
    height: CHECK_SIZE,
    borderRadius: theme.radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.accent,
  },
  card: {
    gap: theme.spacing.md,
    padding: theme.spacing.xl,
    borderRadius: theme.radii.lg,
    backgroundColor: theme.colors.surface,
  },
  row: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: theme.spacing.md,
  },
  label: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.sizes.md,
  },
  value: {
    color: theme.colors.text,
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.semibold,
  },
  total: {
    color: theme.colors.text,
    fontSize: theme.typography.sizes.xl,
    fontWeight: theme.typography.weights.bold,
  },
  payment: {
    color: theme.colors.text,
    fontSize: theme.typography.sizes.md,
    textAlign: "center",
  },
});

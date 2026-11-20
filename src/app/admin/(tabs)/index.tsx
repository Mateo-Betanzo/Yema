import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { ListState } from "@/components/list-state";
import { OrderRow, type OrderRowTone } from "@/components/order-row";
import { PageScreen } from "@/components/page-screen";
import { PrimaryButton } from "@/components/primary-button";
import { StatCard } from "@/components/stat-card";
import { adminOrderKeys, useAdminOrders, useAdminTotals, type AdminTotals, type AppAdminOrder } from "@/lib/admin-orders";
import { useOrdersRealtime } from "@/lib/orders";
import { useSession } from "@/lib/session";
import { useRefreshOnFocus } from "@/lib/use-refresh-on-focus";
import { groupAdminOrders } from "@/logic/admin-orders";
import { formatARS, formatNumber } from "@/logic/currency";
import { theme } from "@/theme";

// The admin Home (spec 005: RF-1 to RF-6, RF-20, RF-24, RF-25), as the Home of the Figma: the totals of
// today (spec 007: RF-1 to RF-4), the new orders to accept or reject, the ones to deliver today (late
// ones first) and the accepted ones of later days. It refreshes by itself through Realtime, when the tab gains focus
// again, when the app comes to the foreground (QueryProvider) and when the list is pulled down; each
// refresh recomputes "today".
// Every admin order query starts with adminOrderKeys.all: one invalidation refreshes them all.
const REALTIME_KEYS = [adminOrderKeys.all];

export default function AdminHome() {
  const orders = useAdminOrders();
  const totals = useAdminTotals();
  const { profile } = useSession();
  // The totals are under adminOrderKeys.all too, so Realtime refreshes them with the orders.
  useOrdersRealtime("admin-orders", REALTIME_KEYS);
  useRefreshOnFocus(orders.refetch);
  useRefreshOnFocus(totals.refetch);

  const now = new Date();
  const { fresh, today, upcoming } = groupAdminOrders(orders.data ?? [], now);
  const open = (order: AppAdminOrder) =>
    router.push({ pathname: "/admin/order/[id]", params: { id: String(order.id) } });

  return (
    <PageScreen
      title={profile?.first_name ? `Hola, ${profile.first_name}` : "Hola"}
      back={false}
      tabRoot
      // Spec 008, RF-1: the way to a counter sale (the Figma's "Add · Scanner" menu, without the scanner).
      action={{ icon: "plus", label: "Nueva venta", onPress: () => router.push("/admin/counter-sale") }}
      onRefresh={() => {
        void orders.refetch();
        void totals.refetch();
      }}
      refreshing={orders.isRefetching}
    >
      <Totals totals={totals.isPending ? null : (totals.data ?? null)} failed={totals.isError} onRetry={() => totals.refetch()} />
      <ListState
        loading={orders.isPending}
        error={orders.isError ? "No pudimos cargar los pedidos" : null}
        empty={null}
        onRetry={() => orders.refetch()}
      >
        <Section id="fresh" title="Nuevos" empty="No hay pedidos nuevos" orders={fresh} now={now} onOpen={open} />
        <Section id="today" title="Para hoy" empty="No hay entregas para hoy" orders={today} now={now} onOpen={open} />
        <Section id="upcoming" title="Próximos" empty="No hay pedidos próximos" orders={upcoming} now={now} onOpen={open} />
      </ListState>
    </PageScreen>
  );
}

// Spec 007, RF-1 to RF-3: what came in today, the orders delivered today and the ones still to deliver
// today, as the cards of the Figma. If they fail, they say so apart: the orders still show.
function Totals({ totals, failed, onRetry }: { totals: AdminTotals | null; failed: boolean; onRetry: () => void }) {
  if (failed) {
    return (
      <View testID="totals" style={styles.totals}>
        <Text style={styles.empty} accessibilityRole="alert">
          No pudimos cargar los totales
        </Text>
        <PrimaryButton title="Reintentar" variant="outline" onPress={onRetry} />
      </View>
    );
  }
  return (
    <View testID="totals" style={styles.totals}>
      <StatCard title="Ingresos hoy" value={totals && formatARS(totals.income_today)} tone="accent" />
      <View style={styles.row}>
        <StatCard title="Entregados hoy" value={totals && formatNumber(totals.delivered_today)} tone="surface" />
        <StatCard title="Falta entregar" value={totals && formatNumber(totals.to_deliver)} tone="primary" />
      </View>
    </View>
  );
}

type SectionProps = {
  id: OrderRowTone;
  title: string;
  empty: string;
  orders: AppAdminOrder[];
  now: Date;
  onOpen: (order: AppAdminOrder) => void;
};

// RF-27 (cambio del 2026-11-19): each section is a card, as the Figma, with its title, its count and its
// rows (or the empty text of RF-4) inside; its id is also the tone of its rows (RF-28).
function Section({ id, title, empty, orders, now, onOpen }: SectionProps) {
  return (
    <View testID={`section-${id}`} style={styles.section}>
      <Text style={styles.title} accessibilityRole="header">
        {`${title} · ${orders.length}`}
      </Text>
      {orders.length === 0 ? (
        <Text style={[styles.empty, styles.sectionEmpty]}>{empty}</Text>
      ) : (
        orders.map((order) => (
          <OrderRow key={order.id} order={order} now={now} tone={id} onPress={() => onOpen(order)} />
        ))
      )}
    </View>
  );
}

// The 48 pt of OrderRow (a pill) and the padding of the card: radius 24 + 12 = 36.
const ROW_HEIGHT = 48;
const SECTION_PADDING = theme.spacing.md;

const styles = StyleSheet.create({
  totals: {
    gap: theme.spacing.md,
  },
  row: {
    flexDirection: "row",
    gap: theme.spacing.md,
  },
  // The card of the Figma: surface, the rows 12 pt from its edges and 8 pt apart. It follows the pill of
  // the rows: its radius is theirs (half the 48 pt) plus the padding, so both curves run parallel.
  section: {
    gap: theme.spacing.sm,
    padding: SECTION_PADDING,
    borderRadius: ROW_HEIGHT / 2 + SECTION_PADDING,
    backgroundColor: theme.colors.surface,
  },
  // The title and the empty text sit one padding further in, clear of the round corners.
  title: {
    paddingHorizontal: SECTION_PADDING,
    paddingVertical: theme.spacing.xs,
    color: theme.colors.text,
    fontSize: theme.typography.sizes.lg,
    fontWeight: theme.typography.weights.semibold,
  },
  empty: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.sizes.md,
  },
  sectionEmpty: {
    paddingHorizontal: SECTION_PADDING,
    paddingBottom: theme.spacing.xs,
  },
});

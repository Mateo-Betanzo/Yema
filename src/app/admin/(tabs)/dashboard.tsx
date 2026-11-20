import { router, useIsFocused } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { AiSummaryCard } from "@/components/ai-summary-card";
import { InventoryBars } from "@/components/inventory-bars";
import { ListState } from "@/components/list-state";
import { clientName } from "@/components/order-row";
import { OrderHistory } from "@/components/order-history";
import { PageScreen } from "@/components/page-screen";
import { SalesChart } from "@/components/sales-chart";
import { SegmentedControl } from "@/components/segmented-control";
import { StatCard } from "@/components/stat-card";
import { TextField } from "@/components/text-field";
import { adminOrderKeys, useAdminTotals, useOrderHistory, useSalesByType, type AdminOrder } from "@/lib/admin-orders";
import { catalogKeys, useStockOverview } from "@/lib/catalog";
import { useDailySummary } from "@/lib/daily-summary";
import { useOrdersRealtime } from "@/lib/orders";
import { useRefreshOnFocus } from "@/lib/use-refresh-on-focus";
import { searchOrders, type SalesPeriod } from "@/logic/admin-dashboard";
import { statusLabel, type OrderStatus } from "@/logic/admin-orders";
import { historySections, orderSummary, type SummaryLine } from "@/logic/client-orders";
import { counterSaleLabel } from "@/logic/counter-sale";
import { dailyFacts } from "@/logic/daily-summary";
import { formatARS } from "@/logic/currency";
import { theme } from "@/theme";

type Tab = "summary" | "history";

const TABS = [
  { value: "summary", label: "Resumen" },
  { value: "history", label: "Historial" },
] as const;

// A delivery moves the orders (totals, sales and history are under adminOrderKeys.all) and the stock.
const REALTIME_KEYS = [adminOrderKeys.all, catalogKeys.stockOverview];

// The Dashboard of the admin (spec 007: RF-5 to RF-19), as the Figma: "Resumen · Historial". Resumen
// has the income of this week and this month, "Ventas por tipo" with its period and the inventory;
// Historial, every finished order by day with a search. The base computes totals, sales and stock; the
// search and the grouping by day are done here with "now". The period and the search live here, so
// they survive switching tabs. It refreshes through Realtime, when the tab gains focus again, when the
// app comes to the foreground (QueryProvider) and when the screen is pulled down. Spec 012: above the
// income, the "Resumen del día" written by the AI from the facts this screen already loaded; it does not
// wait for them nor block them, Realtime does not touch it, and pulling down makes it again from 21 h.
export default function Dashboard() {
  const [tab, setTab] = useState<Tab>("summary");
  const [period, setPeriod] = useState<SalesPeriod>("month");
  const [search, setSearch] = useState("");
  const totals = useAdminTotals();
  const sales = useSalesByType();
  const stock = useStockOverview();
  const history = useOrderHistory();
  const all = [totals, sales, stock, history];
  const summary = [totals, sales, stock];
  // RF-6, RF-12: the facts of the day once the totals, the sales and the stock loaded (null until then).
  const facts =
    totals.data && sales.data && stock.data
      ? dailyFacts({ totals: totals.data, sales: sales.data, stock: stock.data })
      : null;
  const daily = useDailySummary(facts);
  // The tabs stay mounted: the border of the card stops while another tab is on screen (impeccable audit).
  const focused = useIsFocused();
  const remaking = (daily.card.kind === "today" || daily.card.kind === "yesterday") && daily.card.updating;

  useOrdersRealtime("admin-dashboard", REALTIME_KEYS);
  useRefreshOnFocus(totals.refetch);
  useRefreshOnFocus(sales.refetch);
  useRefreshOnFocus(stock.refetch);
  useRefreshOnFocus(history.refetch);

  return (
    <PageScreen
      title="Dashboard"
      back={false}
      tabRoot
      onRefresh={() => {
        all.forEach((q) => void q.refetch());
        // RF-15: from 21 h it also makes the summary again (before, the hook leaves the card as it is).
        if (tab === "summary") daily.refresh();
      }}
      // RF-19: while the summary is made again, the previous one stays and the indicator keeps spinning.
      refreshing={all.some((q) => q.isRefetching) || remaking}
    >
      <SegmentedControl options={TABS} value={tab} onChange={setTab} />
      {tab === "summary" ? (
        <>
          {/* RF-1, RF-18: outside the ListState of the rest, so neither waits for the other. */}
          <AiSummaryCard card={daily.card} onRetry={daily.retry} paused={!focused} />
          <ListState
            loading={summary.some((q) => q.isPending)}
            error={summary.some((q) => q.isError) ? "No pudimos cargar el resumen" : null}
            empty={null}
            onRetry={() => summary.forEach((q) => void q.refetch())}
          >
            <View style={styles.row}>
              <StatCard title="Esta semana" value={formatARS(totals.data?.income_week ?? 0)} tone="light" />
              <StatCard title="Este mes" value={formatARS(totals.data?.income_month ?? 0)} tone="accent" />
            </View>
            <SalesChart rows={sales.data ?? []} period={period} onChange={setPeriod} />
            <InventoryBars types={stock.data ?? []} />
          </ListState>
        </>
      ) : (
        <>
          <TextField
            label="Buscar pedidos"
            placeholder="Buscar…"
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <ListState
            loading={history.isPending}
            error={history.isError ? "No pudimos cargar el historial" : null}
            empty={null}
            onRetry={() => history.refetch()}
          >
            <History orders={history.data ?? []} search={search.trim()} />
          </ListState>
        </>
      )}
    </PageScreen>
  );
}

// A finished order of admin_order_overview with what the history needs (the columns of a view may be null).
type HistoryOrder = AdminOrder & { id: number; status: OrderStatus; total: number };

// RF-14 to RF-18: the finished orders that match the search, by day; each row with the summary of its
// lines, the client and the status, and the total. A row opens the detail of spec 005.
function History({ orders, search }: { orders: readonly AdminOrder[]; search: string }) {
  const finished = orders.filter(
    (order): order is HistoryOrder => order.id !== null && order.status !== null && order.total !== null,
  );
  return (
    <View testID="history" style={styles.history}>
      <OrderHistory
        sections={historySections(searchOrders(finished, search), new Date())}
        empty={search ? `No hay pedidos para «${search}»` : "Todavía no hay pedidos terminados"}
        describe={(order) => ({
          title: orderSummary((order.items ?? []) as SummaryLine[]),
          // Spec 008, RF-15: a counter sale has no client, but "Venta en el local" and its name.
          lines: [order.counter_sale ? counterSaleLabel(order.customer_name) : clientName(order), statusLabel(order.status)],
        })}
        onOpen={(order) => router.push({ pathname: "/admin/order/[id]", params: { id: String(order.id) } })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: theme.spacing.md,
  },
  history: {
    gap: theme.spacing.lg,
  },
});

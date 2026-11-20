import { router } from "expo-router";

import { ListState } from "@/components/list-state";
import { OrderHistory } from "@/components/order-history";
import { PageScreen } from "@/components/page-screen";
import { useClientOrders, type ClientOrder } from "@/lib/client-orders";
import { useRefreshOnFocus } from "@/lib/use-refresh-on-focus";
import { statusLabel } from "@/logic/admin-orders";
import { historySections, orderSummary } from "@/logic/client-orders";

// "Historial de compras" of the client (spec 010: RF-21, RF-22), opened from the menu of the Perfil: the
// history of spec 006 (RF-18 to RF-21) on its own screen, with "back" to the Perfil. It reads the same
// query as the Home (client_orders()): the Home stays mounted while the session lasts and its Realtime
// invalidates that query, so an order that finishes while this screen is open shows up without another
// channel. It also refreshes when it gains focus again, when the app comes to the foreground
// (QueryProvider) and when it is pulled down.
export default function History() {
  const orders = useClientOrders();
  useRefreshOnFocus(orders.refetch);

  const open = (order: ClientOrder) =>
    router.push({ pathname: "/client/order/[id]", params: { id: String(order.id) } });

  return (
    <PageScreen title="Historial de compras" onRefresh={() => void orders.refetch()} refreshing={orders.isRefetching}>
      <ListState
        loading={orders.isPending}
        error={orders.isError ? "No pudimos cargar tus compras" : null}
        empty={null}
        onRetry={() => orders.refetch()}
      >
        <OrderHistory
          sections={historySections(orders.data ?? [], new Date())}
          empty="Todavía no tenés compras"
          describe={(order) => ({ title: orderSummary(order.items), lines: [statusLabel(order.status)] })}
          onOpen={open}
        />
      </ListState>
    </PageScreen>
  );
}

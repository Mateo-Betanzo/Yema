import Feather from "@expo/vector-icons/Feather";
import { router } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";

import { deleteOption } from "@/components/delete-option";
import { PageScreen } from "@/components/page-screen";
import { openRowMenu } from "@/components/row-menu";
import { ListState } from "@/components/list-state";
import { ProductRow } from "@/components/product-row";
import { SegmentedControl } from "@/components/segmented-control";
import {
  useProductOverview,
  useArchiveProduct,
  useSaveProduct,
  useStockOverview,
  type ProductOverview,
  type StockOverview,
} from "@/lib/catalog";
import { catalogErrorMessage } from "@/logic/catalog-errors";
import { formatARS } from "@/logic/currency";
import { formatEggs, formatShortfall, formatStock, productAvailability } from "@/logic/stock";
import { theme } from "@/theme";

type Section = "products" | "stock";

const VIEWS = [
  { value: "products", label: "Productos" },
  { value: "stock", label: "Stock" },
] as const;

// The Productos tab of the admin (spec 003: RF-15 to RF-17, RF-25), as Products in the Figma: the
// "Productos · Stock" selector and every product with its "⋮" menu. Spec 011, RF-6: Tipos y formatos and
// the delivery schedule moved to the menu of the Perfil.
// Units and visibility come from product_overview, computed in the base (RF-35).
export default function Products() {
  const [view, setView] = useState<Section>("products");

  return (
    <PageScreen
      title="Productos"
      back={false}
      tabRoot
      action={{ icon: "plus", label: "Nuevo producto", onPress: () => router.push("/admin/product-form") }}
    >
      <SegmentedControl options={VIEWS} value={view} onChange={setView} />
      {view === "products" ? <ProductList /> : <StockList />}
    </PageScreen>
  );
}

function ProductList() {
  const products = useProductOverview();
  const save = useSaveProduct();
  const archive = useArchiveProduct();

  function menu(product: ProductOverview) {
    openRowMenu(product.name, [
      {
        text: "Editar",
        onPress: () => router.push({ pathname: "/admin/product-form", params: { id: String(product.id) } }),
      },
      {
        text: product.active ? "Desactivar" : "Activar",
        onPress: async () => {
          try {
            await save.mutateAsync({
              id: product.id,
              egg_type_id: product.egg_type_id,
              format_id: product.format_id,
              name: product.name,
              description: product.description,
              price: product.price,
              active: !product.active,
            });
          } catch (error) {
            Alert.alert("No se pudo guardar", catalogErrorMessage(error));
          }
        },
      },
      // Cambio del RF-34: archives it, after asking (RF-44, RF-45, RF-47).
      deleteOption(product.name, () => archive.mutateAsync(product.id)),
      { text: "Cancelar", style: "cancel" },
    ]);
  }

  return (
    <ListState
      loading={products.isPending}
      error={products.isError ? "No pudimos cargar los productos" : null}
      empty={products.data?.length === 0 ? "Todavía no hay productos" : null}
      onRetry={() => products.refetch()}
    >
      {products.data?.map((product) => {
        const availability = productAvailability(product.status, product.units_available);
        return (
          <ProductRow
            key={product.id}
            title={product.name}
            lines={[
              `${product.type_name} · ${product.format_name}`,
              formatARS(product.price),
              ...(product.description ? [product.description] : []),
              availability.text,
            ]}
            dimmed={!availability.visible}
            // Spec 009, RF-26, RF-27: the whole card opens its "⋮" menu.
            onPress={() => menu(product)}
            menuLabel={`Opciones de ${product.name}`}
          />
        );
      })}
    </ListState>
  );
}

// RF-22: every type, active or not, in maples equivalent and in eggs; each one opens its load and its
// adjustment (RF-18, RF-19). Spec 011, RF-9: the history of every type is the "Historial de stock" of
// the menu of the Perfil. An inactive type still moves stock (RF-5). Spec 004,
// RF-38: from egg_type_overview, with the eggs missing for the active orders when the stock is below
// what they reserve.
function StockList() {
  const types = useStockOverview();

  function open(type: StockOverview, kind: "load" | "adjustment") {
    router.push({ pathname: "/admin/stock-movement", params: { typeId: String(type.id), kind } });
  }

  return (
    <ListState
      loading={types.isPending}
      error={types.isError ? "No pudimos cargar el stock" : null}
      empty={types.data?.length === 0 ? "Todavía no hay tipos" : null}
      onRetry={() => types.refetch()}
    >
      {types.data?.map((type) => (
        <View key={type.id} style={styles.stockRow}>
          <View style={styles.stockTexts}>
            <Text style={styles.stockName}>{type.name}</Text>
            <Text style={styles.stockAmount}>{formatStock(type.stock)}</Text>
            <Text style={styles.stockDetail}>{`${formatEggs(type.stock)} en total`}</Text>
            {!type.active && <Text style={styles.stockDetail}>Inactivo</Text>}
            <Shortfall eggs={type.shortfall ?? 0} />
          </View>
          <View style={styles.stockActions}>
            <StockAction label={`Cargar ${type.name}`} text="Cargar" onPress={() => open(type, "load")} />
            <StockAction label={`Ajustar ${type.name}`} text="Ajustar" onPress={() => open(type, "adjustment")} />
          </View>
        </View>
      ))}
    </ListState>
  );
}

/** RF-38: "Faltan N huevos para los pedidos en curso", with an icon; nothing when none are missing. */
function Shortfall({ eggs }: { eggs: number }) {
  const text = formatShortfall(eggs);
  if (!text) return null;
  return (
    <View style={styles.shortfall} accessible accessibilityLabel={text}>
      <Feather name="alert-circle" size={16} color={theme.colors.text} />
      <Text style={styles.shortfallText}>{text}</Text>
    </View>
  );
}

function StockAction({ label, text, onPress }: { label: string; text: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.stockAction, pressed && styles.pressed]}
    >
      <Text style={styles.stockActionText}>{text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stockRow: {
    gap: theme.spacing.md,
    padding: theme.spacing.lg,
    borderRadius: theme.radii.lg,
    backgroundColor: theme.colors.surface,
  },
  stockTexts: {
    gap: 2,
  },
  stockName: {
    color: theme.colors.text,
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.semibold,
  },
  stockAmount: {
    color: theme.colors.text,
    fontSize: theme.typography.sizes.lg,
  },
  stockDetail: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.sizes.sm,
  },
  shortfall: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
    marginTop: theme.spacing.xs,
  },
  shortfallText: {
    flex: 1,
    color: theme.colors.text,
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.semibold,
  },
  stockActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
  },
  stockAction: {
    minHeight: 48,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: theme.colors.fieldBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  stockActionText: {
    color: theme.colors.text,
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.semibold,
  },
  pressed: {
    opacity: 0.7,
  },
});

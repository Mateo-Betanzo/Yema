import { router } from "expo-router";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";

import { deleteOption } from "@/components/delete-option";
import { Icon } from "@/components/icon";
import { PageScreen } from "@/components/page-screen";
import { openRowMenu } from "@/components/row-menu";
import { ListState } from "@/components/list-state";
import { PrimaryButton } from "@/components/primary-button";
import {
  useArchiveEggType,
  useArchiveFormat,
  useEggTypes,
  useFormats,
  useSaveFormat,
  useSaveType,
  type EggType,
  type Format,
} from "@/lib/catalog";
import { catalogErrorMessage } from "@/logic/catalog-errors";
import { formatEggs } from "@/logic/stock";
import { theme } from "@/theme";

const LOAD_FORMAT_LOCKED = "El formato de carga no se puede desactivar: se usa para cargar stock";

// Tipos y formatos (spec 003: RF-2 to RF-10). Two lists; each row has a "⋮" menu (the system Alert)
// with "Editar", "Desactivar" or "Activar" and, since the cambio del RF-34, "Eliminar", which archives
// (nothing is deleted from the base, principle 7) and never shows for the load format (RF-49).
export default function CatalogSetup() {
  const types = useEggTypes();
  const formats = useFormats();
  const saveType = useSaveType();
  const saveFormat = useSaveFormat();
  const archiveType = useArchiveEggType();
  const archiveFormat = useArchiveFormat();

  async function save(write: () => Promise<unknown>) {
    try {
      await write();
    } catch (error) {
      Alert.alert("No se pudo guardar", catalogErrorMessage(error));
    }
  }

  function typeMenu(type: EggType) {
    openRowMenu(type.name, [
      { text: "Editar", onPress: () => router.push({ pathname: "/admin/type-form", params: { id: String(type.id) } }) },
      {
        text: type.active ? "Desactivar" : "Activar",
        onPress: () => save(() => saveType.mutateAsync({ id: type.id, name: type.name, active: !type.active })),
      },
      deleteOption(type.name, () => archiveType.mutateAsync(type.id)),
      { text: "Cancelar", style: "cancel" },
    ]);
  }

  function formatMenu(format: Format) {
    openRowMenu(format.name, [
      {
        text: "Editar",
        onPress: () => router.push({ pathname: "/admin/format-form", params: { id: String(format.id) } }),
      },
      {
        text: format.active ? "Desactivar" : "Activar",
        onPress: () => {
          // RF-10: the base would reject it too; the admin gets the reason without a request.
          if (format.is_load_format && format.active) {
            Alert.alert("No se puede desactivar", LOAD_FORMAT_LOCKED);
            return;
          }
          return save(() =>
            saveFormat.mutateAsync({ id: format.id, name: format.name, eggs: format.eggs, active: !format.active }),
          );
        },
      },
      ...(format.is_load_format ? [] : [deleteOption(format.name, () => archiveFormat.mutateAsync(format.id))]),
      { text: "Cancelar", style: "cancel" },
    ]);
  }

  return (
    <PageScreen title="Tipos y formatos">
      <Section title="Tipos">
        <ListState
          loading={types.isPending}
          error={types.isError ? "No pudimos cargar los tipos" : null}
          empty={types.data?.length === 0 ? "Todavía no hay tipos" : null}
          onRetry={() => types.refetch()}
        >
          {types.data?.map((type) => (
            <SetupRow key={type.id} name={type.name} active={type.active} onMenu={() => typeMenu(type)} />
          ))}
        </ListState>
        <PrimaryButton title="Agregar tipo" variant="outline" onPress={() => router.push("/admin/type-form")} />
      </Section>

      <Section title="Formatos">
        <ListState
          loading={formats.isPending}
          error={formats.isError ? "No pudimos cargar los formatos" : null}
          empty={formats.data?.length === 0 ? "Todavía no hay formatos" : null}
          onRetry={() => formats.refetch()}
        >
          {formats.data?.map((format) => (
            <SetupRow
              key={format.id}
              name={format.name}
              detail={formatEggs(format.eggs) + (format.is_load_format ? " · Formato de carga" : "")}
              active={format.active}
              onMenu={() => formatMenu(format)}
            />
          ))}
        </ListState>
        <PrimaryButton title="Agregar formato" variant="outline" onPress={() => router.push("/admin/format-form")} />
      </Section>
    </PageScreen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

/**
 * A type or a format. Spec 009, RF-26, RF-27: the whole card is one button "Opciones de <nombre>" that
 * opens its "⋮" menu; the "⋮" inside is only drawn, and the detail and the state are its value.
 */
function SetupRow({ name, detail, active, onMenu }: { name: string; detail?: string; active: boolean; onMenu: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Opciones de ${name}`}
      accessibilityValue={{ text: [detail, active ? null : "Inactivo"].filter(Boolean).join(", ") }}
      onPress={onMenu}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.rowTexts}>
        <Text style={styles.rowName}>{name}</Text>
        {detail ? <Text style={styles.rowDetail}>{detail}</Text> : null}
        {!active && <Text style={styles.rowDetail}>Inactivo</Text>}
      </View>
      <View style={styles.menu}>
        <Icon name="more-vert" size={24} color={theme.colors.text} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: theme.spacing.md,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.sizes.lg,
    fontWeight: theme.typography.weights.semibold,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    paddingLeft: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radii.lg,
    backgroundColor: theme.colors.surface,
  },
  rowTexts: {
    flex: 1,
    gap: 2,
  },
  rowName: {
    color: theme.colors.text,
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.semibold,
  },
  rowDetail: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.sizes.sm,
  },
  menu: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.7,
  },
});

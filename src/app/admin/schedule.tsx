import { router } from "expo-router";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";

import { deleteOption } from "@/components/delete-option";
import { Icon } from "@/components/icon";
import { ListState } from "@/components/list-state";
import { PageScreen } from "@/components/page-screen";
import { openRowMenu } from "@/components/row-menu";
import { useArchiveDeliverySlot, useDeliverySlots, useSaveDeliverySlot } from "@/lib/schedule";
import { formatSlot } from "@/logic/delivery";
import {
  scheduleDays,
  slotDeletionName,
  slotErrorMessage,
  slotName,
  slotToggle,
  type ScheduleSlot,
} from "@/logic/schedule";
import { theme } from "@/theme";

// The delivery schedule of the admin (spec 009: RF-2 to RF-5), without Figma (brief of T3): the seven
// days from Monday, each with its slots from the earliest as grey rows ("9 a 11 h", "Cupo 5" and, when
// it is off, "Inactiva" in text), "Sin franjas" on an empty day, and the "+" of a new slot. Cambio del
// 2026-11-19 (RF-18 to RF-22, RF-27): each row is one button "Opciones de lunes 9 a 11 h" with a "⋮",
// which opens the system menu with "Editar", "Desactivar" or "Activar", "Eliminar" and "Cancelar", as the
// "⋮" of Productos and Tipos y formatos.
export default function Schedule() {
  const slots = useDeliverySlots();
  const save = useSaveDeliverySlot();
  const archive = useArchiveDeliverySlot();
  const all = slots.data ?? [];
  const days = scheduleDays(all);

  async function setActive(slot: ScheduleSlot) {
    try {
      const { id, weekday, starts_at, ends_at, capacity, active } = slot;
      await save.mutateAsync({ id, weekday, starts_at, ends_at, capacity, active: !active });
    } catch (error) {
      Alert.alert("No se pudo guardar", slotErrorMessage(error));
    }
  }

  // RF-19: turning on checks the overlap (RF-8); turning off with orders in progress asks first (RF-13).
  function toggle(slot: ScheduleSlot) {
    const next = slotToggle(slot, all);
    if (next.kind === "blocked") {
      Alert.alert("No se pudo activar", next.message);
      return;
    }
    if (next.kind === "confirm") {
      Alert.alert(next.message, undefined, [
        { text: "Volver", style: "cancel" },
        { text: "Guardar", onPress: () => void setActive(slot) },
      ]);
      return;
    }
    void setActive(slot);
  }

  function menu(day: string, slot: ScheduleSlot) {
    openRowMenu(`${day} · ${formatSlot(slot.starts_at, slot.ends_at)}`, [
      { text: "Editar", onPress: () => router.push({ pathname: "/admin/slot-form", params: { id: String(slot.id) } }) },
      { text: slot.active ? "Desactivar" : "Activar", onPress: () => toggle(slot) },
      // RF-20 to RF-22: asks, archives, and says why when the base refuses (orders in progress).
      deleteOption(slotDeletionName(slot), () => archive.mutateAsync(slot.id), slotErrorMessage),
      { text: "Cancelar", style: "cancel" },
    ]);
  }

  return (
    <PageScreen
      title="Agenda de reparto"
      action={{ icon: "plus", label: "Nueva franja", onPress: () => router.push("/admin/slot-form") }}
    >
      <ListState
        loading={slots.isPending}
        error={slots.isError ? "No pudimos cargar la agenda" : null}
        empty={slots.data?.length === 0 ? "Todavía no hay franjas" : null}
        onRetry={() => slots.refetch()}
      >
        {days.map((day) => (
          <View key={day.weekday} testID={`day-${day.weekday}`} style={styles.day}>
            <Text style={styles.dayTitle} accessibilityRole="header">
              {day.name}
            </Text>
            {day.slots.length === 0 ? (
              <Text style={styles.empty}>Sin franjas</Text>
            ) : (
              day.slots.map((slot) => <SlotRow key={slot.id} slot={slot} onMenu={() => menu(day.name, slot)} />)
            )}
          </View>
        ))}
      </ListState>
    </PageScreen>
  );
}

/**
 * RF-2, RF-3, RF-18, RF-27: one button per slot, "Opciones de lunes 9 a 11 h", with the capacity and the
 * state as its value; the "⋮" inside is only drawn (the card is the button, so a screen reader finds one
 * control per slot).
 */
function SlotRow({ slot, onMenu }: { slot: ScheduleSlot; onMenu: () => void }) {
  const hours = formatSlot(slot.starts_at, slot.ends_at);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Opciones de ${slotName(slot)}`}
      accessibilityValue={{ text: [`Cupo ${slot.capacity}`, slot.active ? null : "inactiva"].filter(Boolean).join(", ") }}
      onPress={onMenu}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.texts}>
        <Text style={[styles.hours, !slot.active && styles.off]}>{hours}</Text>
        <Text style={styles.secondary}>{`Cupo ${slot.capacity}`}</Text>
      </View>
      {slot.active ? null : <Text style={styles.secondary}>Inactiva</Text>}
      <Icon name="more-vert" size={24} color={theme.colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  day: {
    gap: theme.spacing.sm,
  },
  dayTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.sizes.lg,
    fontWeight: theme.typography.weights.semibold,
  },
  empty: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.sizes.md,
  },
  row: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radii.lg,
    backgroundColor: theme.colors.surface,
  },
  pressed: {
    transform: [{ scale: 0.98 }],
  },
  texts: {
    flex: 1,
    gap: 2,
  },
  hours: {
    color: theme.colors.text,
    fontSize: theme.typography.sizes.lg,
    fontWeight: theme.typography.weights.semibold,
  },
  // An inactive slot reads grey (secondary on surface, 4.94:1) and also says "Inactiva" in text.
  off: {
    color: theme.colors.textSecondary,
  },
  secondary: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.sizes.sm,
  },
});

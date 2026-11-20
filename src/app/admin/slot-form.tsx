import { router, useLocalSearchParams } from "expo-router";
import { useRef, useState, type ReactNode } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";

import { FormAlert } from "@/components/auth-form-screen";
import { FilterChips } from "@/components/filter-chips";
import { ListState } from "@/components/list-state";
import { PageScreen } from "@/components/page-screen";
import { PrimaryButton } from "@/components/primary-button";
import { RoundButton } from "@/components/round-button";
import { SegmentedControl } from "@/components/segmented-control";
import { useDeliverySlots, useSaveDeliverySlot } from "@/lib/schedule";
import { formatSlot } from "@/logic/delivery";
import {
  activeOrdersText,
  HALF_HOURS,
  hourLabel,
  slotChangeNeedsWarning,
  slotErrorMessage,
  slotProblem,
  WEEK,
  type ScheduleSlot,
} from "@/logic/schedule";
import { theme } from "@/theme";

const MIN_CAPACITY = 1;
const MAX_CAPACITY = 100;
const DAYS = WEEK.map((day) => ({ value: day.weekday, label: day.name }));
const HOURS = HALF_HOURS.map((hour) => ({ value: hour, label: hourLabel(hour) }));
const STATES = [
  { value: "active", label: "Activa" },
  { value: "inactive", label: "Inactiva" },
] as const;

const dayName = (weekday: number) => WEEK.find((day) => day.weekday === weekday)?.name ?? "";

// The form of a delivery slot (spec 009: RF-4 to RF-10, RF-16), without Figma (brief of T3): the day
// (chips to create; fixed text to edit, since a slot keeps its day), "Desde" and "Hasta" as chips of
// half hours, the capacity as − N +, "Activa · Inactiva" and "Guardar". What would stop a save is said
// before sending it (slotProblem); the base keeps the same rules and answers if something changed. A
// change that touches a slot with orders in progress (its hours, its capacity, or turning it off) warns
// first that those orders stay as they are (RF-13).
export default function SlotForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const slots = useDeliverySlots();
  const editing = id === undefined ? undefined : slots.data?.find((slot) => slot.id === Number(id));

  if (id === undefined) {
    return (
      <PageScreen title="Nueva franja">
        <Fields slots={slots.data ?? []} />
      </PageScreen>
    );
  }
  return (
    <PageScreen title={editing ? `${dayName(editing.weekday)} · ${formatSlot(editing.starts_at, editing.ends_at)}` : "Franja"}>
      <ListState
        loading={slots.isPending}
        error={slots.isError ? "No pudimos cargar la franja" : null}
        empty={editing ? null : "Esta franja ya no existe"}
        onRetry={() => slots.refetch()}
      >
        {editing ? <Fields key={editing.id} slot={editing} slots={slots.data ?? []} /> : null}
      </ListState>
    </PageScreen>
  );
}

function Fields({ slot, slots }: { slot?: ScheduleSlot; slots: readonly ScheduleSlot[] }) {
  const save = useSaveDeliverySlot();
  const [weekday, setWeekday] = useState(slot?.weekday ?? 1);
  const [startsAt, setStartsAt] = useState(slot?.starts_at.slice(0, 5) ?? "09:00");
  const [endsAt, setEndsAt] = useState(slot?.ends_at.slice(0, 5) ?? "11:00");
  const [capacity, setCapacity] = useState(slot?.capacity ?? 5);
  const [active, setActive] = useState(slot?.active ?? true);
  const [error, setError] = useState<string | null>(null);
  // One save per tap: isPending only updates on the next render (RF-10).
  const sending = useRef(false);

  function submit() {
    const problem = slotProblem({ id: slot?.id, weekday, starts_at: startsAt, ends_at: endsAt, active }, slots);
    if (problem) {
      setError(problem);
      return;
    }
    if (slot && slotChangeNeedsWarning(slot, { starts_at: startsAt, ends_at: endsAt, capacity, active })) {
      Alert.alert(activeOrdersText(slot.active_orders ?? 0), undefined, [
        { text: "Volver", style: "cancel" },
        { text: "Guardar", onPress: () => void send() },
      ]);
      return;
    }
    void send();
  }

  async function send() {
    if (sending.current) return;
    sending.current = true;
    setError(null);
    try {
      await save.mutateAsync({
        ...(slot ? { id: slot.id } : {}),
        weekday,
        starts_at: startsAt,
        ends_at: endsAt,
        capacity,
        active,
      });
      router.back();
    } catch (failure) {
      setError(slotErrorMessage(failure));
    } finally {
      sending.current = false;
    }
  }

  return (
    <>
      <Field title="Día">
        {slot ? (
          <Text style={styles.value}>{dayName(slot.weekday)}</Text>
        ) : (
          <FilterChips label="Día" options={DAYS} value={weekday} onChange={setWeekday} />
        )}
      </Field>
      <Field title={`Desde · ${hourLabel(startsAt)}`}>
        <FilterChips label="Desde" options={HOURS} value={startsAt} onChange={setStartsAt} />
      </Field>
      <Field title={`Hasta · ${hourLabel(endsAt)}`}>
        <FilterChips label="Hasta" options={HOURS} value={endsAt} onChange={setEndsAt} />
      </Field>
      <Field title="Cupo">
        <View style={styles.capacity}>
          <RoundButton
            icon="minus"
            label="Bajar el cupo"
            disabled={capacity <= MIN_CAPACITY}
            onPress={() => setCapacity(capacity - 1)}
          />
          <Text style={styles.count} accessibilityLabel={`Cupo ${capacity}`}>
            {capacity}
          </Text>
          <RoundButton
            icon="plus"
            label="Subir el cupo"
            disabled={capacity >= MAX_CAPACITY}
            onPress={() => setCapacity(capacity + 1)}
          />
        </View>
      </Field>
      <Field title="Estado">
        <SegmentedControl
          options={STATES}
          value={active ? "active" : "inactive"}
          onChange={(state) => setActive(state === "active")}
        />
      </Field>
      <FormAlert message={error} />
      <PrimaryButton title="Guardar" loading={save.isPending} onPress={submit} />
    </>
  );
}

function Field({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: theme.spacing.sm,
  },
  title: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.semibold,
  },
  value: {
    color: theme.colors.text,
    fontSize: theme.typography.sizes.lg,
    fontWeight: theme.typography.weights.semibold,
  },
  capacity: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.lg,
  },
  // Figures of one width, so "+" does not move from 9 to 10.
  count: {
    minWidth: 40,
    color: theme.colors.text,
    fontSize: theme.typography.sizes.xl,
    fontWeight: theme.typography.weights.bold,
    fontVariant: ["tabular-nums"],
    textAlign: "center",
  },
});

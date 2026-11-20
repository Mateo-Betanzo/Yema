import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text } from "react-native";

import { PageScreen } from "@/components/page-screen";
import { FormAlert } from "@/components/auth-form-screen";
import { ListState } from "@/components/list-state";
import { PrimaryButton } from "@/components/primary-button";
import { TextField } from "@/components/text-field";
import { useAdjustStock, useEggTypes, useFormats, useLoadStock, type EggType, type Format } from "@/lib/catalog";
import { catalogErrorMessage } from "@/logic/catalog-errors";
import { validateAdjustment, validateLoad } from "@/logic/catalog-validation";
import { formatEggs, formatStock } from "@/logic/stock";
import { theme } from "@/theme";

type Kind = "load" | "adjustment";

// A load or an adjustment of the stock of a type (spec 003: RF-18 to RF-21), `?typeId=&kind=`. The base
// computes the eggs of a load and checks again that an adjustment fits (RF-20, RF-35); the form shows
// each mistake before sending.
export default function StockMovement() {
  const params = useLocalSearchParams<{ typeId?: string; kind?: string }>();
  const kind: Kind = params.kind === "adjustment" ? "adjustment" : "load";
  const types = useEggTypes();
  const formats = useFormats();
  const type = types.data?.find((item) => item.id === Number(params.typeId));
  const loadFormat = formats.data?.find((format) => format.is_load_format);
  const title = `${kind === "load" ? "Cargar" : "Ajustar"} ${type?.name ?? ""}`.trim();

  if (!type || !loadFormat) {
    return (
      <PageScreen title={title}>
        <ListState
          loading={types.isPending || formats.isPending}
          error={types.isError || formats.isError ? "No pudimos cargar el stock" : "Ese tipo ya no existe"}
          empty={null}
          onRetry={() => {
            types.refetch();
            formats.refetch();
          }}
        >
          {null}
        </ListState>
      </PageScreen>
    );
  }

  return kind === "load" ? (
    <LoadFields title={title} type={type} loadFormat={loadFormat} />
  ) : (
    <AdjustmentFields title={title} type={type} />
  );
}

function useSubmitState() {
  const [alert, setAlert] = useState<string | null>(null);
  async function send(write: () => Promise<unknown>) {
    setAlert(null);
    try {
      await write();
      router.back();
    } catch (failure) {
      setAlert(catalogErrorMessage(failure));
    }
  }
  return { alert, send };
}

function LoadFields({ title, type, loadFormat }: { title: string; type: EggType; loadFormat: Format }) {
  const load = useLoadStock();
  const { alert, send } = useSubmitState();
  const [form, setForm] = useState({ packs: "", note: "" });
  const [errors, setErrors] = useState<Partial<Record<"packs" | "note", string>>>({});

  function change(field: "packs" | "note", value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function submit() {
    const result = validateLoad(form);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    await send(() => load.mutateAsync({ eggTypeId: type.id, ...result.data }));
  }

  return (
    <PageScreen title={title}>
      <Text style={styles.info}>{`Hay ${formatStock(type.stock)}`}</Text>
      <Text style={styles.detail}>{`Cada ${loadFormat.name} suma ${formatEggs(loadFormat.eggs)}`}</Text>
      <TextField
        label="Packs"
        placeholder="Ej.: 2"
        value={form.packs}
        onChangeText={(value) => change("packs", value)}
        error={errors.packs}
        keyboardType="number-pad"
      />
      <TextField
        label="Nota (opcional)"
        placeholder="Ej.: proveedor, remito"
        value={form.note}
        onChangeText={(value) => change("note", value)}
        error={errors.note}
      />
      <FormAlert message={alert} />
      <PrimaryButton title="Cargar" onPress={submit} loading={load.isPending} />
    </PageScreen>
  );
}

function AdjustmentFields({ title, type }: { title: string; type: EggType }) {
  const adjust = useAdjustStock();
  const { alert, send } = useSubmitState();
  const [form, setForm] = useState({ eggs: "", reason: "" });
  const [errors, setErrors] = useState<Partial<Record<"eggs" | "reason", string>>>({});

  function change(field: "eggs" | "reason", value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function submit() {
    const result = validateAdjustment(form, type.stock);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    await send(() => adjust.mutateAsync({ eggTypeId: type.id, ...result.data }));
  }

  return (
    <PageScreen title={title}>
      <Text style={styles.info}>{`Hay ${formatStock(type.stock)}`}</Text>
      <Text style={styles.detail}>{`${formatEggs(type.stock)} en total`}</Text>
      <TextField
        label="Huevos a restar"
        placeholder="Ej.: 6"
        value={form.eggs}
        onChangeText={(value) => change("eggs", value)}
        error={errors.eggs}
        keyboardType="number-pad"
      />
      <TextField
        label="Motivo"
        placeholder="Ej.: rotura, vencidos, conteo"
        value={form.reason}
        onChangeText={(value) => change("reason", value)}
        error={errors.reason}
      />
      <FormAlert message={alert} />
      <PrimaryButton title="Ajustar" onPress={submit} loading={adjust.isPending} />
    </PageScreen>
  );
}

const styles = StyleSheet.create({
  info: {
    color: theme.colors.text,
    fontSize: theme.typography.sizes.lg,
  },
  detail: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.sizes.sm,
  },
});

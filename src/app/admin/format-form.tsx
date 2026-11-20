import { router, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import type { TextInputInstance } from "react-native";

import { PageScreen } from "@/components/page-screen";
import { FormAlert } from "@/components/auth-form-screen";
import { ListState } from "@/components/list-state";
import { PrimaryButton } from "@/components/primary-button";
import { TextField } from "@/components/text-field";
import { useFormats, useSaveFormat, type Format } from "@/lib/catalog";
import { catalogErrorMessage } from "@/logic/catalog-errors";
import { validateFormatForm, type FormatForm as Fields } from "@/logic/catalog-validation";

// New or edited format (spec 003: RF-6, RF-7, RF-8). `?id=` edits; the new eggs apply from now on,
// also to the load format (the base keeps the movements already recorded). Activating is done from
// the menu of Tipos y formatos.
export default function FormatForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const formats = useFormats();
  const existing = id === undefined ? undefined : formats.data?.find((format) => format.id === Number(id));
  const title = id === undefined ? "Nuevo formato" : "Editar formato";

  if (id !== undefined && !existing) {
    return (
      <PageScreen title={title}>
        <ListState
          loading={formats.isPending}
          error={formats.isError ? "No pudimos cargar el formato" : "Ese formato ya no existe"}
          empty={null}
          onRetry={() => formats.refetch()}
        >
          {null}
        </ListState>
      </PageScreen>
    );
  }
  return <FormatFields key={id ?? "new"} title={title} existing={existing} />;
}

function FormatFields({ title, existing }: { title: string; existing?: Format }) {
  const save = useSaveFormat();
  const [form, setForm] = useState<Fields>({ name: existing?.name ?? "", eggs: existing ? String(existing.eggs) : "" });
  const [errors, setErrors] = useState<Partial<Record<keyof Fields, string>>>({});
  const [alert, setAlert] = useState<string | null>(null);
  const eggsRef = useRef<TextInputInstance>(null);

  function change(field: keyof Fields, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function submit() {
    const result = validateFormatForm(form);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setAlert(null);
    try {
      await save.mutateAsync({ ...(existing && { id: existing.id }), ...result.data, active: existing?.active ?? true });
      router.back();
    } catch (failure) {
      setAlert(catalogErrorMessage(failure));
    }
  }

  return (
    <PageScreen title={title}>
      <TextField
        label="Nombre"
        placeholder="Ej.: Maple"
        value={form.name}
        onChangeText={(value) => change("name", value)}
        error={errors.name}
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => eggsRef.current?.focus()}
      />
      <TextField
        ref={eggsRef}
        label="Huevos por unidad"
        placeholder="Ej.: 30"
        value={form.eggs}
        onChangeText={(value) => change("eggs", value)}
        error={errors.eggs}
        keyboardType="number-pad"
        returnKeyType="done"
        onSubmitEditing={submit}
      />
      <FormAlert message={alert} />
      <PrimaryButton title="Guardar" onPress={submit} loading={save.isPending} />
    </PageScreen>
  );
}

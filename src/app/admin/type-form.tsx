import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";

import { PageScreen } from "@/components/page-screen";
import { FormAlert } from "@/components/auth-form-screen";
import { ListState } from "@/components/list-state";
import { PrimaryButton } from "@/components/primary-button";
import { TextField } from "@/components/text-field";
import { useEggTypes, useSaveType, type EggType } from "@/lib/catalog";
import { catalogErrorMessage } from "@/logic/catalog-errors";
import { validateTypeForm } from "@/logic/catalog-validation";

// New or edited type (spec 003: RF-2, RF-3, RF-4). `?id=` edits; activating is done from the menu of
// Tipos y formatos, so the form keeps the state the type has.
export default function TypeForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const types = useEggTypes();
  const existing = id === undefined ? undefined : types.data?.find((type) => type.id === Number(id));
  const title = id === undefined ? "Nuevo tipo" : "Editar tipo";

  if (id !== undefined && !existing) {
    return (
      <PageScreen title={title}>
        <ListState
          loading={types.isPending}
          error={types.isError ? "No pudimos cargar el tipo" : "Ese tipo ya no existe"}
          empty={null}
          onRetry={() => types.refetch()}
        >
          {null}
        </ListState>
      </PageScreen>
    );
  }
  return <TypeFields key={id ?? "new"} title={title} existing={existing} />;
}

function TypeFields({ title, existing }: { title: string; existing?: EggType }) {
  const save = useSaveType();
  const [name, setName] = useState(existing?.name ?? "");
  const [error, setError] = useState<string | undefined>();
  const [alert, setAlert] = useState<string | null>(null);

  async function submit() {
    const result = validateTypeForm({ name });
    if (!result.ok) {
      setError(result.errors.name);
      return;
    }
    setError(undefined);
    setAlert(null);
    try {
      await save.mutateAsync({ ...(existing && { id: existing.id }), name: result.data.name, active: existing?.active ?? true });
      router.back();
    } catch (failure) {
      setAlert(catalogErrorMessage(failure));
    }
  }

  return (
    <PageScreen title={title}>
      <TextField
        label="Nombre"
        placeholder="Ej.: Medianos"
        value={name}
        onChangeText={(value) => {
          setName(value);
          setError(undefined);
        }}
        error={error}
        autoCapitalize="words"
        returnKeyType="done"
        onSubmitEditing={submit}
      />
      <FormAlert message={alert} />
      <PrimaryButton title="Guardar" onPress={submit} loading={save.isPending} />
    </PageScreen>
  );
}

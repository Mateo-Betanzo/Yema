import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { PageScreen } from "@/components/page-screen";
import { FormAlert } from "@/components/auth-form-screen";
import { FilterChips } from "@/components/filter-chips";
import { ListState } from "@/components/list-state";
import { PrimaryButton } from "@/components/primary-button";
import { TextField } from "@/components/text-field";
import { useEggTypes, useFormats, useProductOverview, useSaveProduct, type ProductOverview } from "@/lib/catalog";
import { catalogErrorMessage } from "@/logic/catalog-errors";
import { findSameCombination, validateProductForm, type ProductForm as Fields } from "@/logic/catalog-validation";
import { formatNumber } from "@/logic/currency";
import { theme } from "@/theme";

// New or edited product (spec 003: RF-11 to RF-14). A new one chooses its type and format; an edited
// one shows them fixed (the base does not let them change). Activating is done from the menu of the
// list, or here when the chosen combination already exists inactive (RF-12).
export default function ProductForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const types = useEggTypes();
  const formats = useFormats();
  const products = useProductOverview();
  const existing = id === undefined ? undefined : products.data?.find((product) => product.id === Number(id));
  const title = id === undefined ? "Nuevo producto" : "Editar producto";
  const queries = [types, formats, products];
  const ready = queries.every((query) => query.data) && (id === undefined || existing);

  if (!ready) {
    return (
      <PageScreen title={title}>
        <ListState
          loading={queries.some((query) => query.isPending)}
          error={queries.some((query) => query.isError) ? "No pudimos cargar el catálogo" : "Ese producto ya no existe"}
          empty={null}
          onRetry={() => queries.forEach((query) => query.refetch())}
        >
          {null}
        </ListState>
      </PageScreen>
    );
  }

  return (
    <ProductFields
      key={id ?? "new"}
      title={title}
      existing={existing}
      types={types.data ?? []}
      formats={formats.data ?? []}
      products={products.data ?? []}
    />
  );
}

type Option = { id: number; name: string };

type FieldsProps = {
  title: string;
  existing?: ProductOverview;
  types: readonly Option[];
  formats: readonly Option[];
  products: readonly ProductOverview[];
};

function ProductFields({ title, existing, types, formats, products }: FieldsProps) {
  const save = useSaveProduct();
  const [form, setForm] = useState<Fields>({
    typeId: existing?.egg_type_id ?? null,
    formatId: existing?.format_id ?? null,
    name: existing?.name ?? "",
    description: existing?.description ?? "",
    price: existing ? formatNumber(existing.price) : "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof Fields, string>>>({});
  const [alert, setAlert] = useState<string | null>(null);

  // RF-12: only a new product can collide with another one's type and format.
  const same = existing ? undefined : findSameCombination(products, form.typeId, form.formatId);

  function change<K extends keyof Fields>(field: K, value: Fields[K]) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setAlert(null);
  }

  async function write(input: Parameters<typeof save.mutateAsync>[0]) {
    try {
      await save.mutateAsync(input);
      router.back();
    } catch (failure) {
      setAlert(catalogErrorMessage(failure));
    }
  }

  async function submit() {
    const result = validateProductForm(form);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    if (same) return;
    setErrors({});
    setAlert(null);
    await write({ ...(existing && { id: existing.id }), ...result.data, active: existing?.active ?? true });
  }

  return (
    <PageScreen title={title}>
      {existing ? (
        <Text style={styles.fixed}>{`${existing.type_name} · ${existing.format_name}`}</Text>
      ) : (
        <>
          <Choice
            label="Tipo"
            options={types}
            value={form.typeId}
            error={errors.typeId}
            onChange={(value) => change("typeId", value)}
          />
          <Choice
            label="Formato"
            options={formats}
            value={form.formatId}
            error={errors.formatId}
            onChange={(value) => change("formatId", value)}
          />
          {same && (
            <View style={styles.notice} accessibilityLiveRegion="polite">
              <Text style={styles.noticeText}>
                {same.active
                  ? `Ya existe «${same.name}» con ese tipo y formato`
                  : `Ya existe «${same.name}» con ese tipo y formato, inactivo`}
              </Text>
              {!same.active && (
                <PrimaryButton
                  title="Activar"
                  variant="outline"
                  loading={save.isPending}
                  onPress={() =>
                    write({
                      id: same.id,
                      egg_type_id: same.egg_type_id,
                      format_id: same.format_id,
                      name: same.name,
                      description: same.description,
                      price: same.price,
                      active: true,
                    })
                  }
                />
              )}
            </View>
          )}
        </>
      )}
      <TextField
        label="Nombre"
        placeholder="Ej.: Pack Mediano"
        value={form.name}
        onChangeText={(value) => change("name", value)}
        error={errors.name}
      />
      <TextField
        label="Descripción (opcional)"
        placeholder="Ej.: 6 maples medianos"
        value={form.description}
        onChangeText={(value) => change("description", value)}
        error={errors.description}
      />
      <TextField
        label="Precio"
        placeholder="Ej.: 10.500"
        value={form.price}
        onChangeText={(value) => change("price", value)}
        error={errors.price}
        keyboardType="number-pad"
      />
      <FormAlert message={alert} />
      <PrimaryButton title="Guardar" onPress={submit} loading={save.isPending} disabled={same !== undefined} />
    </PageScreen>
  );
}

function Choice({
  label,
  options,
  value,
  error,
  onChange,
}: {
  label: string;
  options: readonly Option[];
  value: number | null;
  error?: string;
  onChange: (value: number) => void;
}) {
  return (
    <View style={styles.choice}>
      <Text style={styles.choiceLabel}>{label}</Text>
      <FilterChips
        label={label}
        options={options.map((option) => ({ value: option.id, label: option.name }))}
        value={value}
        onChange={(chosen) => {
          if (chosen !== null) onChange(chosen);
        }}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fixed: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.sizes.md,
  },
  choice: {
    gap: theme.spacing.xs,
  },
  choiceLabel: {
    color: theme.colors.text,
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.semibold,
  },
  error: {
    color: theme.colors.text,
    fontSize: theme.typography.sizes.sm,
  },
  notice: {
    gap: theme.spacing.md,
    padding: theme.spacing.lg,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  noticeText: {
    color: theme.colors.text,
    fontSize: theme.typography.sizes.md,
  },
});

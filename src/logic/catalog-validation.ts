// Catalog and stock forms (spec 003: RF-3, RF-7, RF-12, RF-13, RF-18 to RF-21). The base repeats every
// rule (and checks the stock again inside adjust_stock): these show each mistake under its field before
// anything is sent.
import { formatNumber } from "./currency";
import { characterCount, parseWholeNumber, REQUIRED, tooLong, type Validation } from "./form-rules";

const CATALOG_NAME_MAX = 30;
const PRODUCT_NAME_MAX = 50;
const TEXT_MAX = 120;
const FORMAT_EGGS = { min: 1, max: 1000 };
const PRICE = { min: 1, max: 10_000_000 };
const PACKS = { min: 1, max: 100 };

const FORMAT_EGGS_RULE = "Ingresá entre 1 y 1.000 huevos";
const PRICE_FORMAT_RULE = "Ingresá el precio en pesos, sin centavos. Ej.: 10.500";
const PRICE_RANGE_RULE = "El precio va de $1 a $10.000.000";
const PACKS_RULE = "Ingresá entre 1 y 100 packs";
const EGGS_RULE = "Ingresá una cantidad de huevos mayor que 0";

/** "", or the message for a required name of up to `max` characters (already trimmed). */
function nameError(name: string, max: number): string | undefined {
  if (name === "") return REQUIRED;
  if (characterCount(name) > max) return tooLong(max);
  return undefined;
}

function withoutUndefined<T extends object>(errors: T): Partial<T> {
  return Object.fromEntries(Object.entries(errors).filter(([, value]) => value !== undefined)) as Partial<T>;
}

function result<Form, Data>(errors: Partial<Record<keyof Form, string | undefined>>, data: () => Data) {
  const found = withoutUndefined(errors) as Partial<Record<keyof Form, string>>;
  return (Object.keys(found).length > 0 ? { ok: false, errors: found } : { ok: true, data: data() }) as Validation<
    Form,
    Data
  >;
}

export type TypeForm = { name: string };

/** RF-3. */
export function validateTypeForm(form: TypeForm): Validation<TypeForm, { name: string }> {
  const name = form.name.trim();
  return result<TypeForm, { name: string }>({ name: nameError(name, CATALOG_NAME_MAX) }, () => ({ name }));
}

export type FormatForm = { name: string; eggs: string };

/** RF-7. */
export function validateFormatForm(form: FormatForm): Validation<FormatForm, { name: string; eggs: number }> {
  const name = form.name.trim();
  const eggs = parseWholeNumber(form.eggs);
  const eggsError =
    form.eggs.trim() === ""
      ? REQUIRED
      : eggs === null || eggs < FORMAT_EGGS.min || eggs > FORMAT_EGGS.max
        ? FORMAT_EGGS_RULE
        : undefined;
  return result<FormatForm, { name: string; eggs: number }>(
    { name: nameError(name, CATALOG_NAME_MAX), eggs: eggsError },
    () => ({ name, eggs: eggs as number }),
  );
}

/** Whole pesos, with or without dots for thousands ("10500", "10.500"); anything else is null. */
export function parsePrice(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d{1,3}(\.\d{3})*$/.test(trimmed) && !/^\d+$/.test(trimmed)) return null;
  return Number(trimmed.replaceAll(".", ""));
}

export type ProductForm = {
  typeId: number | null;
  formatId: number | null;
  name: string;
  description: string;
  price: string;
};

export type ProductData = {
  egg_type_id: number;
  format_id: number;
  name: string;
  description: string | null;
  price: number;
};

/** RF-13. */
export function validateProductForm(form: ProductForm): Validation<ProductForm, ProductData> {
  const name = form.name.trim();
  const description = form.description.trim();
  const price = parsePrice(form.price);
  const priceError =
    form.price.trim() === ""
      ? REQUIRED
      : price === null
        ? PRICE_FORMAT_RULE
        : price < PRICE.min || price > PRICE.max
          ? PRICE_RANGE_RULE
          : undefined;

  return result<ProductForm, ProductData>(
    {
      typeId: form.typeId === null ? "Elegí un tipo" : undefined,
      formatId: form.formatId === null ? "Elegí un formato" : undefined,
      name: nameError(name, PRODUCT_NAME_MAX),
      description: characterCount(description) > TEXT_MAX ? tooLong(TEXT_MAX) : undefined,
      price: priceError,
    },
    () => ({
      egg_type_id: form.typeId as number,
      format_id: form.formatId as number,
      name,
      description: description === "" ? null : description,
      price: price as number,
    }),
  );
}

type Combination = { egg_type_id: number | null; format_id: number | null };

/** RF-12: the product that already has this type and format, active or not. */
export function findSameCombination<P extends Combination>(
  products: readonly P[],
  typeId: number | null,
  formatId: number | null,
): P | undefined {
  if (typeId === null || formatId === null) return undefined;
  return products.find((product) => product.egg_type_id === typeId && product.format_id === formatId);
}

export type LoadForm = { packs: string; note: string };

/** RF-18, RF-21. */
export function validateLoad(form: LoadForm): Validation<LoadForm, { packs: number; note: string | null }> {
  const packs = parseWholeNumber(form.packs);
  const note = form.note.trim();
  const packsError =
    form.packs.trim() === ""
      ? REQUIRED
      : packs === null || packs < PACKS.min || packs > PACKS.max
        ? PACKS_RULE
        : undefined;
  return result<LoadForm, { packs: number; note: string | null }>(
    { packs: packsError, note: characterCount(note) > TEXT_MAX ? tooLong(TEXT_MAX) : undefined },
    () => ({ packs: packs as number, note: note === "" ? null : note }),
  );
}

export type AdjustmentForm = { eggs: string; reason: string };

/** "No alcanza: hay 375 huevos" (RF-20). Also used for the error of the base. */
export function notEnoughStock(stock: number): string {
  return `No alcanza: hay ${formatNumber(stock)} ${stock === 1 ? "huevo" : "huevos"}`;
}

/** RF-19 to RF-21. `stock` is the current stock of the type, as the screen last read it. */
export function validateAdjustment(
  form: AdjustmentForm,
  stock: number,
): Validation<AdjustmentForm, { eggs: number; reason: string }> {
  const eggs = parseWholeNumber(form.eggs);
  const reason = form.reason.trim();
  const eggsError =
    form.eggs.trim() === ""
      ? REQUIRED
      : eggs === null || eggs < 1
        ? EGGS_RULE
        : eggs > stock
          ? notEnoughStock(stock)
          : undefined;
  return result<AdjustmentForm, { eggs: number; reason: string }>(
    { eggs: eggsError, reason: nameError(reason, TEXT_MAX) },
    () => ({ eggs: eggs as number, reason }),
  );
}

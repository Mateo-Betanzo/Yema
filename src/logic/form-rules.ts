// Rules and messages shared by every form (auth in spec 002, catalog and stock in spec 003).

export type Validation<Form, Data> =
  | { ok: true; data: Data }
  | { ok: false; errors: Partial<Record<keyof Form, string>> };

export const REQUIRED = "Completá este campo";
export const NO_CONNECTION = "No hay conexión. Revisá tu internet e intentá de nuevo";

/** Counts characters like Postgres' char_length (code points), not UTF-16 units: an emoji is one. */
export function characterCount(text: string): number {
  return Array.from(text).length;
}

export function tooLong(max: number): string {
  return `Usá hasta ${max} caracteres`;
}

/** A whole number typed as digits only (spaces around are ignored), or null. */
export function parseWholeNumber(text: string): number | null {
  const trimmed = text.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : null;
}

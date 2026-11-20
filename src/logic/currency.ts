// Amounts are whole Argentine pesos (integers). Deliberately does not use Intl: the result must not
// depend on the phone's language or the JS engine.
export function formatARS(amount: number): string {
  return "$" + formatNumber(amount);
}

/** A non-negative whole number with a dot for thousands ("36.000"), for amounts, eggs and units. */
export function formatNumber(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`Expected a non-negative safe integer amount, received ${String(value)}`);
  }
  // String(-0) is "0", so negative zero is shown as 0.
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

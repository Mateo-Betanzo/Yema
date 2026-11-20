// Calling and writing to a client from an order (spec 005: RF-9, RF-10). Phones are stored as 10 digits
// without the 0 or the 15 (spec 002), so a mobile is dialled from anywhere as +54 9 and the number.

/** "tel:+5491133445566", or null without a phone. */
export function callUrl(phone: string | null): string | null {
  return phone ? `tel:+549${phone}` : null;
}

/** "https://wa.me/5491133445566" (wa.me takes the number without "+"), or null without a phone. */
export function whatsappUrl(phone: string | null): string | null {
  return phone ? `https://wa.me/549${phone}` : null;
}

export function contactName(c: { name: string | null; firstName: string | null; lastName: string | null }): string {
  return c.name ?? [c.firstName, c.lastName].filter(Boolean).join(" ");
}

export const CONTACT_CATEGORY: Record<string, string> = {
  CUSTOMER: "Kunde",
  SUPPLIER: "Lieferant",
  PARTNER: "Partner",
};

export function formatAddress(
  contact: { name: string | null; firstName: string | null; lastName: string | null },
  a?: { street: string; zip: string; city: string; country: string },
): string {
  const lines = [contactName(contact)];
  if (a) {
    if (a.street) lines.push(a.street);
    lines.push(`${a.zip} ${a.city}`.trim());
    if (a.country && a.country !== "DE") lines.push(a.country);
  }
  return lines.filter(Boolean).join("\n");
}

export function contactName(c: { name: string | null; firstName: string | null; lastName: string | null }): string {
  return c.name ?? [c.firstName, c.lastName].filter(Boolean).join(" ");
}

export const CONTACT_CATEGORY: Record<string, string> = {
  CUSTOMER: "Kunde",
  SUPPLIER: "Lieferant",
  PARTNER: "Partner",
};

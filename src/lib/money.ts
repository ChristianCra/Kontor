// Beträge werden durchgehend als ganze Cent gespeichert und gerechnet.

const eur = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

export function formatCents(cents: number, currency = "EUR"): string {
  if (currency === "EUR") return eur.format(cents / 100);
  return new Intl.NumberFormat("de-DE", { style: "currency", currency }).format(cents / 100);
}

// Akzeptiert deutsche Eingaben wie "1.234,56", "12,5" oder "12.50".
export function parseCents(input: string): number {
  const s = input.trim().replace(/\s|€/g, "");
  if (!s) return 0;
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const value = Number(normalized);
  if (!Number.isFinite(value)) throw new Error(`Ungültiger Betrag: ${input}`);
  return Math.round(value * 100);
}

export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

export function formatDate(d: Date | null | undefined): string {
  return d ? d.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" }) : "";
}

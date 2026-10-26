// Summenberechnung für Rechnungen: Netto je Position, Steuer je Steuersatz gruppiert
// und erst auf Gruppenebene gerundet, wie in deutschen Rechnungen üblich.

export type PositionInput = {
  quantity: number;
  priceNet: number; // Cent
  discount: number; // Prozent
  taxRate: number;
  optional?: boolean; // optionale Angebotsposition, wird nicht summiert
};

export type TaxGroup = { rate: number; net: number; tax: number };

export type Totals = {
  positions: number[]; // Netto je Position in Cent
  net: number;
  tax: number;
  gross: number;
  taxGroups: TaxGroup[];
};

export function positionNet(p: PositionInput): number {
  return Math.round(p.quantity * p.priceNet * (1 - p.discount / 100));
}

// taxType "ss" (Kleinunternehmer), "eu" (innergemeinschaftlich) und "noteu" (Drittland)
// werden ohne Umsatzsteuer berechnet.
export function computeTotals(positions: PositionInput[], taxType = "default", invoiceDiscount = 0): Totals {
  const taxFree = taxType !== "default";
  const nets = positions.map(positionNet);
  const groups = new Map<number, number>();
  nets.forEach((net, i) => {
    if (positions[i].optional) return;
    const rate = taxFree ? 0 : positions[i].taxRate;
    groups.set(rate, (groups.get(rate) ?? 0) + net);
  });
  const taxGroups = [...groups.entries()]
    .sort(([a], [b]) => b - a)
    .map(([rate, groupNet]) => {
      const net = Math.round(groupNet * (1 - invoiceDiscount / 100));
      return { rate, net, tax: Math.round((net * rate) / 100) };
    });
  const net = taxGroups.reduce((s, g) => s + g.net, 0);
  const tax = taxGroups.reduce((s, g) => s + g.tax, 0);
  return { positions: nets, net, tax, gross: net + tax, taxGroups };
}

export function paymentStatus(gross: number, paid: number): number {
  if (paid <= 0) return 200;
  if (paid < gross) return 750;
  return 1000;
}

// Belegposition: Betrag ist entweder netto oder brutto erfasst.
// Bei Reverse Charge und Kleinunternehmer-Lieferanten fließt keine Umsatzsteuer.
export function voucherPositionSums(p: { amount: number; net: boolean; taxRate: number }, taxType = "default") {
  const rate = taxType === "default" ? p.taxRate : 0;
  if (p.net) {
    const tax = Math.round((p.amount * rate) / 100);
    return { net: p.amount, tax, gross: p.amount + tax };
  }
  const net = Math.round(p.amount / (1 + rate / 100));
  return { net, tax: p.amount - net, gross: p.amount };
}

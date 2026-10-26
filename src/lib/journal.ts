import { computeTotals } from "./calc";
import { contactName } from "./contacts";

// Einheitliches Buchungsjournal aus Rechnungen, Gutschriften und Belegen.
// Grundlage für UStVA, EÜR und DATEV-Export.

export type Chart = "skr03" | "skr04";

export type Account = { number: string; name: string; kind: string };

export type JournalEntry = {
  source: "invoice" | "voucher";
  docId: number;
  docNumber: string;
  docLabel: string;
  date: Date; // Rechnungs- bzw. Belegdatum (Soll)
  party: string;
  contactId: number | null;
  direction: "in" | "out"; // Einnahme oder Ausgabe
  taxType: string;
  taxRate: number;
  account: Account;
  skr03: string; // SKR03-Nummer für die kontenrahmenunabhängige Gruppierung (EÜR)
  net: number; // Cent, mit Vorzeichen (Gutschrift/Storno negativ)
  tax: number;
  gross: number;
  docGross: number; // Brutto des ganzen Dokuments für die Aufteilung von Zahlungen
  payments: { date: Date; amount: number; transactionId: number | null }[];
  enshrined: boolean;
};

const REVENUE_ACCOUNTS: Record<string, { skr03: string; skr04: string; name: string }> = {
  "default:19": { skr03: "8400", skr04: "4400", name: "Erlöse 19 % USt" },
  "default:7": { skr03: "8300", skr04: "4300", name: "Erlöse 7 % USt" },
  "default:0": { skr03: "8200", skr04: "4200", name: "Erlöse (steuerfrei)" },
  eu: { skr03: "8125", skr04: "4125", name: "Steuerfreie innergemeinschaftliche Lieferungen" },
  noteu: { skr03: "8338", skr04: "4338", name: "Erlöse aus im Inland nicht steuerbaren Leistungen" },
  ss: { skr03: "8195", skr04: "4185", name: "Erlöse als Kleinunternehmer (§19 UStG)" },
};

export function revenueAccount(taxType: string, rate: number, chart: Chart): Account {
  const a = REVENUE_ACCOUNTS[taxType === "default" ? `default:${rate}` : taxType] ?? REVENUE_ACCOUNTS["default:19"];
  return { number: a[chart], name: a.name, kind: "REVENUE" };
}

type InvoiceLike = {
  id: number;
  type: string;
  status: number;
  invoiceNumber: string | null;
  invoiceDate: Date;
  taxType: string;
  discount: number;
  contactId: number;
  sumGross: number;
  enshrinedAt: Date | null;
  contact: { name: string | null; firstName: string | null; lastName: string | null };
  positions: { quantity: number; priceNet: number; discount: number; taxRate: number }[];
  payments: { date: Date; amount: number; transactionId: number | null }[];
};

type VoucherLike = {
  id: number;
  status: number;
  creditDebit: string;
  documentNumber: string;
  supplierName: string;
  supplierId: number | null;
  voucherDate: Date;
  taxType: string;
  sumGross: number;
  enshrinedAt: Date | null;
  positions: { taxRate: number; sumNet: number; sumTax: number; sumGross: number; accountingType: { skr03: string; skr04: string; name: string; kind: string } }[];
  payments: { date: Date; amount: number; transactionId: number | null }[];
};

export function invoiceEntries(inv: InvoiceLike, chart: Chart): JournalEntry[] {
  if (inv.status === 100 || inv.type === "MA") return [];
  const sign = inv.type === "GU" ? -1 : 1;
  const totals = computeTotals(inv.positions, inv.taxType, inv.discount);
  return totals.taxGroups.map((g) => ({
    source: "invoice" as const,
    docId: inv.id,
    docNumber: inv.invoiceNumber ?? "",
    docLabel: inv.type === "GU" ? "Gutschrift" : inv.type === "SR" ? "Storno" : "Rechnung",
    date: inv.invoiceDate,
    party: contactName(inv.contact),
    contactId: inv.contactId,
    direction: "in" as const,
    taxType: inv.taxType,
    taxRate: g.rate,
    account: revenueAccount(inv.taxType, g.rate, chart),
    skr03: revenueAccount(inv.taxType, g.rate, "skr03").number,
    net: sign * g.net,
    tax: sign * g.tax,
    gross: sign * (g.net + g.tax),
    docGross: sign * inv.sumGross,
    // Erstattungen auf Gutschriften mindern die Einnahmen
    payments: inv.payments.map((p) => ({ ...p, amount: sign * p.amount })),
    enshrined: !!inv.enshrinedAt,
  }));
}

export function voucherEntries(v: VoucherLike, chart: Chart): JournalEntry[] {
  if (v.status === 50) return [];
  return v.positions.map((p) => ({
    source: "voucher" as const,
    docId: v.id,
    docNumber: v.documentNumber,
    docLabel: "Beleg",
    date: v.voucherDate,
    party: v.supplierName,
    contactId: v.supplierId,
    direction: v.creditDebit === "D" ? ("out" as const) : ("in" as const),
    taxType: v.taxType,
    taxRate: p.taxRate,
    account: { number: p.accountingType[chart], name: p.accountingType.name, kind: p.accountingType.kind },
    skr03: p.accountingType.skr03,
    net: p.sumNet,
    tax: p.sumTax,
    gross: p.sumGross,
    docGross: v.sumGross,
    payments: v.payments,
    enshrined: !!v.enshrinedAt,
  }));
}

export type Period = { from: Date; to: Date }; // to ist exklusiv

const inPeriod = (d: Date, p: Period) => d >= p.from && d < p.to;

// Anteil eines Eintrags, der im Zeitraum bezahlt wurde (Zuflussprinzip)
export function paidShare(e: JournalEntry, p: Period): number {
  if (!e.docGross) return 0;
  const paid = e.payments.filter((x) => inPeriod(x.date, p)).reduce((s, x) => s + x.amount, 0);
  return paid / e.docGross;
}

export type Amounts = { net: number; tax: number; gross: number };

// Beträge eines Eintrags im Zeitraum: nach Belegdatum (Soll) oder nach Zahlung (Ist)
export function amountsIn(e: JournalEntry, p: Period, cash: boolean): Amounts {
  if (!cash) return inPeriod(e.date, p) ? { net: e.net, tax: e.tax, gross: e.gross } : { net: 0, tax: 0, gross: 0 };
  const share = paidShare(e, p);
  const net = Math.round(e.net * share);
  const tax = Math.round(e.tax * share);
  return { net, tax, gross: net + tax };
}

export function periodFor(kind: "MONTH" | "QUARTER" | "YEAR", year: number, index: number): Period {
  if (kind === "YEAR") return { from: new Date(year, 0, 1), to: new Date(year + 1, 0, 1) };
  if (kind === "QUARTER") return { from: new Date(year, (index - 1) * 3, 1), to: new Date(year, index * 3, 1) };
  return { from: new Date(year, index - 1, 1), to: new Date(year, index, 1) };
}

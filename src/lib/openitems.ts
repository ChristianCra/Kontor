import { db } from "./db";
import { contactName } from "./contacts";
import type { OpenItem } from "./matching";

// Alle offenen Rechnungen, Gutschriften und Belege für die Zuordnung von Bankumsätzen
export async function loadOpenItems(): Promise<OpenItem[]> {
  const [invoices, vouchers] = await Promise.all([
    db.invoice.findMany({ where: { status: { in: [200, 750] }, type: { in: ["RE", "AR", "TR", "ER", "GU"] } }, include: { contact: true } }),
    db.voucher.findMany({ where: { status: { in: [100, 750] } } }),
  ]);
  return [
    // Gutschriften sind Auszahlungen und werden wie Ausgaben behandelt
    ...invoices.map((i) => ({
      kind: (i.type === "GU" ? "credit" : "invoice") as OpenItem["kind"],
      id: i.id,
      number: i.invoiceNumber ?? "",
      name: contactName(i.contact),
      open: i.sumGross - i.paidAmount,
      date: i.invoiceDate,
    })),
    ...vouchers.map((v) => ({
      kind: (v.creditDebit === "D" ? "voucher" : "income") as OpenItem["kind"],
      id: v.id,
      number: v.documentNumber,
      name: v.supplierName,
      open: v.sumGross - v.paidAmount,
      date: v.voucherDate,
    })),
  ];
}

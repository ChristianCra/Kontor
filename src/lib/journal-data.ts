import { db } from "./db";
import { invoiceEntries, voucherEntries, type Chart, type JournalEntry } from "./journal";

export async function loadJournal(chart: Chart): Promise<JournalEntry[]> {
  const [invoices, vouchers] = await Promise.all([
    db.invoice.findMany({ where: { status: { not: 100 }, type: { not: "MA" } }, include: { contact: true, positions: true, payments: true } }),
    db.voucher.findMany({ where: { status: { not: 50 } }, include: { positions: { include: { accountingType: true } }, payments: true } }),
  ]);
  return [...invoices.flatMap((i) => invoiceEntries(i, chart)), ...vouchers.flatMap((v) => voucherEntries(v, chart))];
}

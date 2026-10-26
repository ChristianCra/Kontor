import { db } from "./db";
import { getCompany } from "./company";
import { loadJournal } from "./journal-data";
import type { Period } from "./journal";
import type { DatevSettings, DatevTransaction } from "./datev";

export async function loadDatevInput(period: Period) {
  const company = await getCompany();
  const chart = company.chartOfAccounts as "skr03" | "skr04";
  const [entries, payments, accounts] = await Promise.all([
    loadJournal(chart),
    db.payment.findMany({
      where: { date: { gte: period.from, lt: period.to }, OR: [{ transactionId: { not: null } }, { accountId: { not: null } }] },
      include: { invoice: true, voucher: true, transaction: true },
    }),
    db.bankAccount.findMany(),
  ]);
  // SKR04 verwendet für Bank 1800 und Kasse 1600
  const ledger = (a: { ledgerAccount: string; type: string }) => (chart === "skr04" ? (a.type === "CASH" ? "1600" : "1800") : a.ledgerAccount);
  const transactions: DatevTransaction[] = payments.flatMap((p) => {
    const accountId = p.transaction?.accountId ?? p.accountId;
    if (!accountId) return [];
    if (p.invoice) {
      const refund = p.invoice.type === "GU";
      return [{ accountId, date: p.date, amount: p.amount, contactId: p.invoice.contactId, direction: refund ? ("out" as const) : ("in" as const), docNumber: p.invoice.invoiceNumber ?? "", party: p.invoice.address.split("\n")[0] }];
    }
    if (p.voucher) {
      return [{ accountId, date: p.date, amount: p.amount, contactId: p.voucher.supplierId, direction: p.voucher.creditDebit === "D" ? ("out" as const) : ("in" as const), docNumber: p.voucher.documentNumber, party: p.voucher.supplierName }];
    }
    return [];
  });
  const fyStart = new Date(period.from.getFullYear(), company.fiscalYearStart - 1, 1);
  if (fyStart > period.from) fyStart.setFullYear(fyStart.getFullYear() - 1);
  const settings: DatevSettings = {
    advisor: company.datevAdvisor,
    client: company.datevClient,
    fiscalYearStart: fyStart,
    chart,
    bankAccounts: new Map(accounts.map((a) => [a.id, ledger(a)])),
  };
  const inPeriod = entries.filter((e) => e.date >= period.from && e.date < period.to);
  const problems: string[] = [];
  if (!company.datevAdvisor || !company.datevClient) problems.push("Berater- und Mandantennummer fehlen in den Einstellungen.");
  const noSupplier = inPeriod.filter((e) => e.direction === "out" && !e.contactId);
  if (noSupplier.length) problems.push(`${new Set(noSupplier.map((e) => e.docId)).size} Belege ohne verknüpften Lieferanten laufen über den Sammelkreditor 70000.`);
  const open = inPeriod.filter((e) => !e.enshrined);
  return { entries, transactions, settings, problems, docCount: new Set(inPeriod.map((e) => `${e.source}${e.docId}`)).size, openCount: new Set(open.map((e) => `${e.source}${e.docId}`)).size };
}

import { db } from "./db";

export async function accountBalances(): Promise<Map<number, number>> {
  const [accounts, sums, manual] = await Promise.all([
    db.bankAccount.findMany(),
    db.transaction.groupBy({ by: ["accountId"], _sum: { amount: true } }),
    // Manuell gebuchte Zahlungen ohne Bankumsatz (z. B. bar bezahlte Belege)
    db.payment.findMany({ where: { transactionId: null, accountId: { not: null } }, include: { voucher: true, invoice: true } }),
  ]);
  const map = new Map<number, number>();
  for (const a of accounts) map.set(a.id, a.openingBalance);
  for (const s of sums) map.set(s.accountId, (map.get(s.accountId) ?? 0) + (s._sum.amount ?? 0));
  for (const p of manual) {
    const outgoing = p.voucher ? p.voucher.creditDebit === "D" : p.invoice?.type === "GU";
    map.set(p.accountId!, (map.get(p.accountId!) ?? 0) + (outgoing ? -p.amount : p.amount));
  }
  return map;
}

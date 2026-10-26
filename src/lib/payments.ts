import { db } from "./db";
import { paymentStatus } from "./calc";
import { voucherStatusFor } from "./vouchers";

// Rechnungen und Gutschriften liegen in der Tabelle Invoice, Ein- und Ausgabebelege in Voucher
export type Target = { kind: "invoice" | "credit" | "voucher" | "income"; id: number };

// Verknüpft einen Bankumsatz mit einer Rechnung oder einem Beleg und bucht die Zahlung
export async function linkTransaction(transactionId: number, target: Target) {
  return db.$transaction(async (tx) => {
    const t = await tx.transaction.findUniqueOrThrow({ where: { id: transactionId }, include: { payments: true } });
    const used = t.payments.reduce((s, p) => s + p.amount, 0);
    const remaining = Math.abs(t.amount) - used;
    if (remaining <= 0) throw new Error("Der Umsatz ist bereits vollständig zugeordnet.");

    if (target.kind === "invoice" || target.kind === "credit") {
      const inv = await tx.invoice.findUniqueOrThrow({ where: { id: target.id } });
      if (inv.status === 100) throw new Error("Rechnungsentwürfe können nicht bezahlt werden.");
      const incoming = inv.type !== "GU";
      if (incoming !== t.amount > 0) throw new Error(incoming ? "Rechnungen werden mit Zahlungseingängen ausgeglichen." : "Gutschriften werden mit Zahlungsausgängen ausgeglichen.");
      const amount = Math.min(remaining, inv.sumGross - inv.paidAmount);
      if (amount <= 0) throw new Error("Die Rechnung ist bereits bezahlt.");
      await tx.payment.create({ data: { invoiceId: inv.id, transactionId, amount, date: t.valueDate, note: t.purpose.slice(0, 200) } });
      const paidAmount = inv.paidAmount + amount;
      const status = paymentStatus(inv.sumGross, paidAmount);
      if (status === 1000) await tx.invoice.updateMany({ where: { parentId: inv.id, type: "MA" }, data: { status: 1000 } });
      await tx.invoice.update({ where: { id: inv.id }, data: { paidAmount, status } });
    } else {
      const v = await tx.voucher.findUniqueOrThrow({ where: { id: target.id } });
      if (v.status === 50) throw new Error("Bitte den Beleg zuerst buchen.");
      if ((v.creditDebit === "D") !== t.amount < 0) throw new Error(v.creditDebit === "D" ? "Ausgabebelege werden mit Zahlungsausgängen ausgeglichen." : "Einnahmebelege werden mit Zahlungseingängen ausgeglichen.");
      const amount = Math.min(remaining, v.sumGross - v.paidAmount);
      if (amount <= 0) throw new Error("Der Beleg ist bereits bezahlt.");
      await tx.payment.create({ data: { voucherId: v.id, transactionId, amount, date: t.valueDate, note: t.purpose.slice(0, 200) } });
      const paidAmount = v.paidAmount + amount;
      await tx.voucher.update({ where: { id: v.id }, data: { paidAmount, status: voucherStatusFor(v.sumGross, paidAmount) } });
    }
    const after = await tx.payment.aggregate({ where: { transactionId }, _sum: { amount: true } });
    if ((after._sum.amount ?? 0) >= Math.abs(t.amount)) await tx.transaction.update({ where: { id: transactionId }, data: { status: 200 } });
  });
}

// Hebt alle Zuordnungen eines Umsatzes auf und setzt die Zahlstatus zurück
export async function unlinkTransaction(transactionId: number) {
  return db.$transaction(async (tx) => {
    const payments = await tx.payment.findMany({ where: { transactionId } });
    for (const p of payments) {
      if (p.invoiceId) {
        const inv = await tx.invoice.findUniqueOrThrow({ where: { id: p.invoiceId } });
        const paidAmount = inv.paidAmount - p.amount;
        await tx.invoice.update({ where: { id: inv.id }, data: { paidAmount, status: paymentStatus(inv.sumGross, paidAmount) } });
      }
      if (p.voucherId) {
        const v = await tx.voucher.findUniqueOrThrow({ where: { id: p.voucherId } });
        const paidAmount = v.paidAmount - p.amount;
        await tx.voucher.update({ where: { id: v.id }, data: { paidAmount, status: voucherStatusFor(v.sumGross, paidAmount) } });
      }
    }
    await tx.payment.deleteMany({ where: { transactionId } });
    await tx.transaction.update({ where: { id: transactionId }, data: { status: 100 } });
  });
}

import { db } from "./db";
import { computeTotals, paymentStatus } from "./calc";
import { nextNumber } from "./sequence";

export const INVOICE_STATUS: Record<number, string> = {
  100: "Entwurf",
  200: "Offen",
  750: "Teilbezahlt",
  1000: "Bezahlt",
};

export const INVOICE_TYPE: Record<string, string> = {
  RE: "Rechnung",
  SR: "Stornorechnung",
  MA: "Mahnung",
  AR: "Abschlagsrechnung",
  TR: "Teilrechnung",
  ER: "Schlussrechnung",
};

export const TAX_TYPES: Record<string, string> = {
  default: "Umsatzsteuerpflichtig",
  eu: "Innergemeinschaftliche Lieferung (steuerfrei)",
  noteu: "Ausfuhr Drittland (steuerfrei)",
  ss: "Kleinunternehmer (§19 UStG)",
};

export function isOverdue(inv: { status: number; invoiceDate: Date; timeToPay: number }, now = new Date()): boolean {
  if (inv.status !== 200 && inv.status !== 750) return false;
  const due = new Date(inv.invoiceDate);
  due.setDate(due.getDate() + inv.timeToPay);
  return due < now;
}

export function dueDate(inv: { invoiceDate: Date; timeToPay: number }): Date {
  const due = new Date(inv.invoiceDate);
  due.setDate(due.getDate() + inv.timeToPay);
  return due;
}

export async function recalc(invoiceId: number) {
  const inv = await db.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { positions: true } });
  const t = computeTotals(inv.positions, inv.taxType, inv.discount);
  await db.invoice.update({
    where: { id: invoiceId },
    data: { sumNet: t.net, sumTax: t.tax, sumGross: t.gross },
  });
}

function assertEditable(inv: { enshrinedAt: Date | null; status: number }) {
  if (inv.enshrinedAt) throw new Error("Die Rechnung ist festgeschrieben und kann nicht mehr geändert werden.");
  if (inv.status !== 100) throw new Error("Nur Entwürfe können bearbeitet werden.");
}

// Entwurf abschließen: Nummer vergeben, Status Offen, Beträge und Adresse einfrieren.
export async function finalizeInvoice(id: number) {
  await recalc(id);
  return db.$transaction(async (tx) => {
    const inv = await tx.invoice.findUniqueOrThrow({ where: { id }, include: { positions: true } });
    assertEditable(inv);
    if (inv.positions.length === 0) throw new Error("Die Rechnung hat keine Positionen.");
    const invoiceNumber = await nextNumber(tx, "INVOICE", inv.invoiceDate);
    return tx.invoice.update({
      where: { id },
      data: { invoiceNumber, status: 200, header: `${INVOICE_TYPE[inv.type] ?? "Rechnung"} ${invoiceNumber}` },
    });
  });
}

export async function resetToDraft(id: number) {
  const inv = await db.invoice.findUniqueOrThrow({ where: { id }, include: { payments: true } });
  if (inv.enshrinedAt) throw new Error("Festgeschriebene Rechnungen können nicht zurückgesetzt werden.");
  if (inv.payments.length) throw new Error("Rechnungen mit Zahlungen können nicht zurückgesetzt werden.");
  await db.invoice.update({ where: { id }, data: { status: 100 } });
}

export async function enshrineInvoice(id: number) {
  const inv = await db.invoice.findUniqueOrThrow({ where: { id } });
  if (inv.status === 100) throw new Error("Entwürfe können nicht festgeschrieben werden.");
  if (!inv.enshrinedAt) await db.invoice.update({ where: { id }, data: { enshrinedAt: new Date() } });
}

export async function bookPayment(id: number, amount: number, date: Date, note = "") {
  if (amount <= 0) throw new Error("Der Betrag muss größer als 0 sein.");
  return db.$transaction(async (tx) => {
    const inv = await tx.invoice.findUniqueOrThrow({ where: { id } });
    if (inv.status === 100) throw new Error("Für Entwürfe können keine Zahlungen gebucht werden.");
    if (inv.type === "SR") throw new Error("Für Stornorechnungen können keine Zahlungen gebucht werden.");
    const paidAmount = inv.paidAmount + amount;
    await tx.payment.create({ data: { invoiceId: id, amount, date, note } });
    return tx.invoice.update({
      where: { id },
      data: { paidAmount, status: paymentStatus(inv.sumGross, paidAmount) },
    });
  });
}

// Storno: legt eine Stornorechnung mit negierten Positionen an und schließt beide ab.
export async function cancelInvoice(id: number) {
  return db.$transaction(async (tx) => {
    const inv = await tx.invoice.findUniqueOrThrow({
      where: { id },
      include: { positions: true, cancelledBy: true },
    });
    if (inv.status === 100) throw new Error("Entwürfe werden gelöscht, nicht storniert.");
    if (inv.type === "SR") throw new Error("Eine Stornorechnung kann nicht storniert werden.");
    if (inv.cancelledBy) throw new Error("Die Rechnung wurde bereits storniert.");
    if (inv.paidAmount > 0) throw new Error("Bezahlte Rechnungen können nicht storniert werden. Bitte eine Gutschrift erstellen.");
    const now = new Date();
    const invoiceNumber = await nextNumber(tx, "INVOICE", now);
    const storno = await tx.invoice.create({
      data: {
        invoiceNumber,
        type: "SR",
        status: 1000,
        contactId: inv.contactId,
        address: inv.address,
        invoiceDate: now,
        deliveryDate: inv.deliveryDate,
        deliveryDateUntil: inv.deliveryDateUntil,
        timeToPay: 0,
        header: `Stornorechnung ${invoiceNumber}`,
        headText: `Stornierung der Rechnung ${inv.invoiceNumber} vom ${inv.invoiceDate.toLocaleDateString("de-DE")}.`,
        footText: "",
        taxType: inv.taxType,
        currency: inv.currency,
        discount: inv.discount,
        sumNet: -inv.sumNet,
        sumTax: -inv.sumTax,
        sumGross: -inv.sumGross,
        cancelsId: inv.id,
        enshrinedAt: now,
        positions: {
          create: inv.positions.map((p) => ({
            position: p.position,
            partId: p.partId,
            name: p.name,
            text: p.text,
            quantity: -p.quantity,
            unit: p.unit,
            priceNet: p.priceNet,
            discount: p.discount,
            taxRate: p.taxRate,
          })),
        },
      },
    });
    // Original gilt als ausgeglichen und wird festgeschrieben
    await tx.invoice.update({ where: { id }, data: { status: 1000, enshrinedAt: inv.enshrinedAt ?? now } });
    return storno;
  });
}

export { assertEditable };

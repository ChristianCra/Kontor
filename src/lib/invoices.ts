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
  GU: "Gutschrift",
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

// Rechnungsarten, die Umsatz und Forderungen erzeugen (Mahnungen sind nur Schreiben)
export const REVENUE_TYPES = ["RE", "AR", "TR", "ER", "SR", "GU"];

// Gutschriften mindern den Umsatz; Stornos sind bereits mit negativen Beträgen gespeichert.
export function revenueSign(type: string): number {
  return type === "GU" ? -1 : 1;
}

export function sequenceFor(type: string): string {
  if (type === "AN") return "ORDER";
  if (type === "AB") return "ORDER_CONFIRMATION";
  if (type === "LI") return "DELIVERY_NOTE";
  if (type === "GU") return "CREDIT_NOTE";
  if (type === "MA") return "DUNNING";
  return "INVOICE";
}

export const DUNNING_TITLES = ["Zahlungserinnerung", "1. Mahnung", "2. Mahnung", "Letzte Mahnung"];

export function isOverdue(inv: { status: number; invoiceDate: Date; timeToPay: number; type?: string }, now = new Date()): boolean {
  if (inv.type === "MA" || inv.type === "SR") return false;
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

// Pflichtangaben des Verkäufers nach XRechnung (u. a. BR-DE-2, BR-DE-6, BR-DE-7, BR-DE-1)
export function eInvoiceMissingFields(
  c: { name: string; street: string; zip: string; city: string; email: string; phone: string; vatId: string; taxNumber: string; iban: string } | null,
): string[] {
  if (!c) return ["Firmendaten"];
  const checks: [boolean, string][] = [
    [!!c.name, "Firmenname"],
    [!!(c.street && c.zip && c.city), "Anschrift"],
    [!!c.email, "E-Mail"],
    [!!c.phone, "Telefon"],
    [!!(c.vatId || c.taxNumber), "USt-IdNr. oder Steuernummer"],
    [!!c.iban, "IBAN"],
  ];
  return checks.filter(([ok]) => !ok).map(([, label]) => label);
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
    if (inv.eInvoice) {
      const company = await tx.company.findUnique({ where: { id: 1 } });
      const missing = eInvoiceMissingFields(company);
      if (missing.length) throw new Error(`Für E-Rechnungen fehlen in den Einstellungen: ${missing.join(", ")}.`);
    }
    const invoiceNumber = await nextNumber(tx, sequenceFor(inv.type), inv.invoiceDate);
    const title = inv.type === "MA" ? DUNNING_TITLES[Math.min(inv.dunningLevel, DUNNING_TITLES.length) - 1] : INVOICE_TYPE[inv.type] ?? "Rechnung";
    if (inv.type === "MA" && inv.parentId) {
      await tx.invoice.update({ where: { id: inv.parentId }, data: { dunningLevel: inv.dunningLevel } });
    }
    return tx.invoice.update({
      where: { id },
      data: { invoiceNumber, status: 200, header: `${title} ${invoiceNumber}` },
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
    if (inv.type === "MA") throw new Error("Zahlungen werden auf die gemahnte Rechnung gebucht.");
    const paidAmount = inv.paidAmount + amount;
    const status = paymentStatus(inv.sumGross, paidAmount);
    await tx.payment.create({ data: { invoiceId: id, amount, date, note } });
    // Mit Zahlungseingang sind offene Mahnungen zur Rechnung erledigt
    if (status === 1000) await tx.invoice.updateMany({ where: { parentId: id, type: "MA" }, data: { status: 1000 } });
    return tx.invoice.update({ where: { id }, data: { paidAmount, status } });
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
    if (inv.type === "MA") throw new Error("Mahnungen werden nicht storniert.");
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

// Gutschrift (Rechnungskorrektur) zu einer Rechnung als Entwurf mit den Positionen der Rechnung
export async function createCreditNoteDraft(invoiceId: number) {
  const inv = await db.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { positions: true } });
  if (inv.status === 100 || !["RE", "AR", "TR", "ER"].includes(inv.type)) throw new Error("Gutschriften gibt es nur zu abgeschlossenen Rechnungen.");
  return db.invoice.create({
    data: {
      type: "GU",
      parentId: inv.id,
      contactId: inv.contactId,
      address: inv.address,
      invoiceDate: new Date(),
      deliveryDate: inv.deliveryDate,
      deliveryDateUntil: inv.deliveryDateUntil,
      timeToPay: 0,
      header: "Gutschrift",
      headText: `Gutschrift zur Rechnung ${inv.invoiceNumber} vom ${inv.invoiceDate.toLocaleDateString("de-DE")}.`,
      footText: "Den Betrag erstatten wir Ihnen auf Ihr Konto.",
      taxType: inv.taxType,
      currency: inv.currency,
      discount: inv.discount,
      customerReference: inv.customerReference,
      positions: {
        create: inv.positions.map(({ id: _id, invoiceId: _inv, ...p }) => p),
      },
    },
  });
}

// Mahnung bzw. Zahlungserinnerung zur nächsthöheren Stufe als Entwurf
export async function createDunningDraft(invoiceId: number, fee = 0) {
  const inv = await db.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  if (inv.status !== 200 && inv.status !== 750) throw new Error("Nur offene Rechnungen können gemahnt werden.");
  if (!["RE", "AR", "TR", "ER"].includes(inv.type)) throw new Error("Diese Belegart kann nicht gemahnt werden.");
  const level = Math.min(inv.dunningLevel + 1, DUNNING_TITLES.length);
  const open = inv.sumGross - inv.paidAmount;
  const positions = [
    { position: 1, name: `Offener Betrag aus Rechnung ${inv.invoiceNumber}`, text: `Rechnungsdatum ${inv.invoiceDate.toLocaleDateString("de-DE")}, fällig seit ${dueDate(inv).toLocaleDateString("de-DE")}`, quantity: 1, unit: "Pauschal", priceNet: open, discount: 0, taxRate: 0 },
    ...(fee > 0 ? [{ position: 2, name: "Mahngebühr", text: "", quantity: 1, unit: "Pauschal", priceNet: fee, discount: 0, taxRate: 0 }] : []),
  ];
  const draft = await db.invoice.create({
    data: {
      type: "MA",
      parentId: inv.id,
      dunningLevel: level,
      contactId: inv.contactId,
      address: inv.address,
      invoiceDate: new Date(),
      timeToPay: 7,
      header: DUNNING_TITLES[level - 1],
      headText:
        level === 1
          ? "Sicher haben Sie es nur übersehen: Für die folgende Rechnung konnten wir noch keinen Zahlungseingang feststellen."
          : "Leider konnten wir trotz unserer Erinnerung noch keinen Zahlungseingang zu folgender Rechnung feststellen.",
      footText: "Sollten Sie die Zahlung bereits veranlasst haben, betrachten Sie dieses Schreiben bitte als gegenstandslos.",
      taxType: "default",
      currency: inv.currency,
      positions: { create: positions },
    },
  });
  await recalc(draft.id);
  return draft;
}

export { assertEditable };

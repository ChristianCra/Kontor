import { db } from "./db";
import { computeTotals } from "./calc";
import { nextNumber } from "./sequence";
import { sequenceFor } from "./invoices";

export const ORDER_TYPE: Record<string, string> = {
  AN: "Angebot",
  AB: "Auftragsbestätigung",
  LI: "Lieferschein",
};

export const ORDER_STATUS: Record<number, string> = {
  100: "Entwurf",
  200: "Versendet",
  300: "Abgelehnt",
  500: "Angenommen",
  1000: "Berechnet",
};

export async function recalcOrder(id: number) {
  const o = await db.order.findUniqueOrThrow({ where: { id }, include: { positions: true } });
  const t = computeTotals(o.positions, o.taxType, o.discount);
  await db.order.update({ where: { id }, data: { sumNet: t.net, sumTax: t.tax, sumGross: t.gross } });
}

export async function finalizeOrder(id: number) {
  await recalcOrder(id);
  return db.$transaction(async (tx) => {
    const o = await tx.order.findUniqueOrThrow({ where: { id }, include: { positions: true } });
    if (o.status !== 100) throw new Error("Nur Entwürfe können abgeschlossen werden.");
    if (o.positions.length === 0) throw new Error("Der Beleg hat keine Positionen.");
    const orderNumber = await nextNumber(tx, sequenceFor(o.type), o.orderDate);
    return tx.order.update({ where: { id }, data: { orderNumber, status: 200, header: `${ORDER_TYPE[o.type]} ${orderNumber}` } });
  });
}

export async function setOrderStatus(id: number, status: 300 | 500 | 200) {
  const o = await db.order.findUniqueOrThrow({ where: { id } });
  if (o.status === 100) throw new Error("Bitte den Entwurf zuerst abschließen.");
  if (o.status === 1000) throw new Error("Der Beleg wurde bereits berechnet.");
  await db.order.update({ where: { id }, data: { status } });
}

export async function resetOrderToDraft(id: number) {
  const o = await db.order.findUniqueOrThrow({ where: { id }, include: { children: true, invoices: true } });
  if (o.children.length || o.invoices.length) throw new Error("Es gibt bereits Folgebelege.");
  await db.order.update({ where: { id }, data: { status: 100 } });
}

const copyPositions = <T extends { id: number; position: number; partId: number | null; name: string; text: string; quantity: number; unit: string; priceNet: number; discount: number; taxRate: number; optional?: boolean }>(
  positions: T[],
  includeOptional: boolean,
) =>
  positions
    .filter((p) => includeOptional || !p.optional)
    .sort((a, b) => a.position - b.position)
    .map((p, i) => ({ position: i + 1, partId: p.partId, name: p.name, text: p.text, quantity: p.quantity, unit: p.unit, priceNet: p.priceNet, discount: p.discount, taxRate: p.taxRate }));

// Auftragsbestätigung oder Lieferschein aus einem Angebot/Auftrag
export async function createFollowUpOrder(id: number, type: "AB" | "LI") {
  const o = await db.order.findUniqueOrThrow({ where: { id }, include: { positions: true } });
  if (o.status === 100) throw new Error("Bitte den Entwurf zuerst abschließen.");
  const created = await db.order.create({
    data: {
      type,
      parentId: o.id,
      contactId: o.contactId,
      address: o.address,
      orderDate: new Date(),
      header: ORDER_TYPE[type],
      headText:
        type === "AB"
          ? `Vielen Dank für Ihren Auftrag. Hiermit bestätigen wir Ihnen gemäß ${o.header}:`
          : `Wir liefern Ihnen gemäß ${o.header}:`,
      footText: o.footText,
      taxType: o.taxType,
      currency: o.currency,
      discount: o.discount,
      customerReference: o.customerReference,
      positions: { create: copyPositions(o.positions, false) },
    },
  });
  if (o.type === "AN" && o.status === 200) await db.order.update({ where: { id }, data: { status: 500 } });
  await recalcOrder(created.id);
  return created;
}

// Rechnungsentwurf aus einem Angebot oder einer Auftragsbestätigung
export async function createInvoiceFromOrder(id: number) {
  const o = await db.order.findUniqueOrThrow({ where: { id }, include: { positions: true, contact: true } });
  if (o.status === 100) throw new Error("Bitte den Entwurf zuerst abschließen.");
  if (o.status === 300) throw new Error("Abgelehnte Angebote können nicht berechnet werden.");
  if (o.type === "LI") throw new Error("Lieferscheine werden über den zugehörigen Auftrag berechnet.");
  const company = await db.company.findUnique({ where: { id: 1 } });
  const inv = await db.invoice.create({
    data: {
      orderId: o.id,
      contactId: o.contactId,
      address: o.address,
      invoiceDate: new Date(),
      deliveryDate: new Date(),
      timeToPay: o.contact.defaultTimeToPay ?? company?.defaultTimeToPay ?? 14,
      headText: `Vielen Dank für Ihren Auftrag. Gemäß ${o.header} berechnen wir Ihnen:`,
      footText: "Mit freundlichen Grüßen",
      taxType: o.taxType,
      currency: o.currency,
      discount: o.discount,
      customerReference: o.customerReference,
      eInvoice: !!o.contact.buyerReference,
      positions: { create: copyPositions(o.positions, false) },
    },
  });
  await db.order.update({ where: { id }, data: { status: 1000 } });
  return inv;
}

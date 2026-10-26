import { db } from "./db";
import { getCompany } from "./company";
import { invoiceToPdf, orderToPdf, renderPdf } from "./pdf";
import { buildXRechnung } from "./xrechnung";

// PDF (und bei E-Rechnungen das XML) einer Rechnung, Gutschrift oder Mahnung
export async function invoiceFiles(id: number) {
  const inv = await db.invoice.findUnique({ where: { id }, include: { positions: true, contact: true, parent: true, cancels: true } });
  if (!inv) return null;
  const company = await getCompany();
  const doc = invoiceToPdf(inv);
  // E-Rechnung: strukturierte Daten als Anhang im PDF (Hybridformat nach ZUGFeRD-Vorbild)
  const xml = inv.eInvoice && inv.invoiceNumber ? buildXRechnung({ ...inv, parent: inv.parent ?? inv.cancels }, company) : null;
  if (xml) doc.attachment = { name: "factur-x.xml", xml };
  const pdf = Buffer.from(await renderPdf(doc, company));
  return { inv, pdf, xml, filename: `${inv.invoiceNumber ?? `Entwurf-${inv.id}`}.pdf` };
}

export async function orderFiles(id: number) {
  const order = await db.order.findUnique({ where: { id }, include: { positions: true, contact: true } });
  if (!order) return null;
  const pdf = Buffer.from(await renderPdf(orderToPdf(order), await getCompany()));
  return { order, pdf, filename: `${order.orderNumber ?? `Entwurf-${order.id}`}.pdf` };
}

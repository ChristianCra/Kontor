import { db } from "@/lib/db";
import { getCompany } from "@/lib/company";
import { invoiceToPdf, renderPdf } from "@/lib/pdf";
import { buildXRechnung } from "@/lib/xrechnung";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const inv = await db.invoice.findUnique({ where: { id }, include: { positions: true, contact: true, parent: true, cancels: true } });
  if (!inv) return new Response("Nicht gefunden", { status: 404 });
  const company = await getCompany();
  const doc = invoiceToPdf(inv);
  // E-Rechnung: strukturierte Daten als Anhang im PDF (Hybridformat nach ZUGFeRD-Vorbild)
  if (inv.eInvoice && inv.invoiceNumber) doc.attachment = { name: "factur-x.xml", xml: buildXRechnung({ ...inv, parent: inv.parent ?? inv.cancels }, company) };
  const pdf = await renderPdf(doc, company);
  const filename = `${inv.invoiceNumber ?? `Entwurf-${inv.id}`}.pdf`;
  return new Response(Buffer.from(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${filename}"` },
  });
}

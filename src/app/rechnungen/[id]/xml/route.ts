import { db } from "@/lib/db";
import { getCompany } from "@/lib/company";
import { buildXRechnung } from "@/lib/xrechnung";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const inv = await db.invoice.findUnique({ where: { id }, include: { positions: true, contact: true, parent: true, cancels: true } });
  if (!inv || !inv.invoiceNumber) return new Response("Nicht gefunden", { status: 404 });
  const xml = buildXRechnung({ ...inv, parent: inv.parent ?? inv.cancels }, await getCompany());
  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Content-Disposition": `attachment; filename="${inv.invoiceNumber}.xml"` },
  });
}

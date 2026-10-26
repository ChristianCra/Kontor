import { db } from "@/lib/db";
import { getCompany } from "@/lib/company";
import { orderToPdf, renderPdf } from "@/lib/pdf";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const order = await db.order.findUnique({ where: { id }, include: { positions: true, contact: true } });
  if (!order) return new Response("Nicht gefunden", { status: 404 });
  const pdf = await renderPdf(orderToPdf(order), await getCompany());
  return new Response(Buffer.from(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${order.orderNumber ?? `Entwurf-${order.id}`}.pdf"` },
  });
}

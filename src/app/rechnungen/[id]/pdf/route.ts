import { db } from "@/lib/db";
import { renderInvoicePdf } from "@/lib/pdf";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const inv = await db.invoice.findUnique({ where: { id }, include: { positions: true, contact: true } });
  if (!inv) return new Response("Nicht gefunden", { status: 404 });
  const company = (await db.company.findUnique({ where: { id: 1 } })) ?? {
    id: 1, name: "Meine Firma", street: "", zip: "", city: "", country: "DE", email: "", phone: "",
    taxNumber: "", vatId: "", iban: "", bic: "", bankName: "", smallBusiness: false, defaultTimeToPay: 14,
  };
  const pdf = await renderInvoicePdf(inv, company);
  const filename = `${inv.invoiceNumber ?? `Entwurf-${inv.id}`}.pdf`;
  return new Response(Buffer.from(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${filename}"` },
  });
}

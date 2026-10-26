import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCompany } from "@/lib/company";
import { contactName } from "@/lib/contacts";
import { ORDER_TYPE } from "@/lib/orders";
import { fillTemplate, getTemplate, mailTestMode } from "@/lib/mail";
import { formatCents, formatDate } from "@/lib/money";
import { sendOrderMail } from "@/app/actions/mail";
import { SendMailForm } from "@/components/SendMailForm";

export const dynamic = "force-dynamic";

export default async function SendOrder({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ fehler?: string }> }) {
  const id = Number((await params).id);
  const { fehler } = await searchParams;
  const o = await db.order.findUnique({ where: { id }, include: { contact: true } });
  if (!o) notFound();
  const company = await getCompany();
  const t = await getTemplate("ORDER");
  const vars = {
    dokument: ORDER_TYPE[o.type] ?? "Angebot",
    nummer: o.orderNumber ?? "",
    kunde: contactName(o.contact),
    betrag: formatCents(o.sumGross),
    datum: formatDate(o.orderDate),
    faellig: formatDate(o.validUntil),
    firma: company.name,
  };
  return (
    <div className="space-y-4">
      <h1 className="h1">{vars.dokument} {o.orderNumber} per E-Mail senden</h1>
      {fehler && <div className="rounded-md border border-danger p-3 text-sm text-danger" role="alert">{fehler}</div>}
      {o.status === 100 && <div className="rounded-md border border-amber-500 p-3 text-sm">Entwürfe können nicht versendet werden. Bitte zuerst abschließen.</div>}
      <SendMailForm
        action={sendOrderMail.bind(null, id)}
        to={o.contact.email}
        subject={fillTemplate(t.subject, vars)}
        body={fillTemplate(t.body, vars)}
        attachment={`${o.orderNumber ?? "Entwurf"}.pdf`}
        xml={false}
        back={`/angebote/${id}`}
        testMode={mailTestMode()}
      />
    </div>
  );
}

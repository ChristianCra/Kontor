import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCompany } from "@/lib/company";
import { contactName } from "@/lib/contacts";
import { DUNNING_TITLES, INVOICE_TYPE, dueDate } from "@/lib/invoices";
import { fillTemplate, getTemplate, mailTestMode, type MailDocType } from "@/lib/mail";
import { formatCents, formatDate } from "@/lib/money";
import { sendInvoiceMail } from "@/app/actions/mail";
import { SendMailForm } from "@/components/SendMailForm";

export const dynamic = "force-dynamic";

export default async function SendInvoice({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ fehler?: string }> }) {
  const id = Number((await params).id);
  const { fehler } = await searchParams;
  const inv = await db.invoice.findUnique({ where: { id }, include: { contact: true } });
  if (!inv) notFound();
  const company = await getCompany();
  const docType: MailDocType = inv.type === "MA" ? "DUNNING" : inv.type === "GU" ? "CREDIT_NOTE" : "INVOICE";
  const t = await getTemplate(docType);
  const vars = {
    dokument: inv.type === "MA" ? DUNNING_TITLES[Math.max(0, Math.min(inv.dunningLevel, DUNNING_TITLES.length) - 1)] : INVOICE_TYPE[inv.type] ?? "Rechnung",
    nummer: inv.invoiceNumber ?? "",
    kunde: contactName(inv.contact),
    betrag: formatCents(inv.sumGross),
    datum: formatDate(inv.invoiceDate),
    faellig: formatDate(dueDate(inv)),
    firma: company.name,
  };
  return (
    <div className="space-y-4">
      <h1 className="h1">{vars.dokument} {inv.invoiceNumber} per E-Mail senden</h1>
      {fehler && <div className="rounded-md border border-danger p-3 text-sm text-danger" role="alert">{fehler}</div>}
      {inv.status === 100 && <div className="rounded-md border border-amber-500 p-3 text-sm">Entwürfe können nicht versendet werden. Bitte zuerst abschließen.</div>}
      <SendMailForm
        action={sendInvoiceMail.bind(null, id)}
        to={inv.contact.email}
        subject={fillTemplate(t.subject, vars)}
        body={fillTemplate(t.body, vars)}
        attachment={`${inv.invoiceNumber ?? "Entwurf"}.pdf${inv.eInvoice ? " (mit eingebetteter XRechnung)" : ""}`}
        xml={inv.eInvoice}
        back={`/rechnungen/${id}`}
        testMode={mailTestMode()}
      />
    </div>
  );
}

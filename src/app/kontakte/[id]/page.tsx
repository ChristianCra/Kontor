import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { ContactForm } from "@/components/ContactForm";
import { deleteContact, updateContact } from "@/app/actions/contacts";
import { createInvoiceDraft } from "@/app/actions/invoices";
import { contactName } from "@/lib/contacts";
import { formatCents, formatDate } from "@/lib/money";
import { isOverdue } from "@/lib/invoices";
import { StatusBadge } from "@/components/StatusBadge";

export const dynamic = "force-dynamic";

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const contact = await db.contact.findUnique({
    where: { id },
    include: { addresses: true, invoices: { orderBy: { invoiceDate: "desc" } } },
  });
  if (!contact) notFound();
  const open = contact.invoices.filter((i) => ["RE", "AR", "TR", "ER"].includes(i.type) && (i.status === 200 || i.status === 750)).reduce((s, i) => s + i.sumGross - i.paidAmount, 0);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="h1">{contactName(contact)}</h1>
          <div className="text-sm text-muted">Kundennummer {contact.customerNumber} · offen {formatCents(open)}</div>
        </div>
        <div className="flex gap-2">
          <form action={createInvoiceDraft}>
            <input type="hidden" name="contactId" value={id} />
            <button className="btn-primary">Rechnung erstellen</button>
          </form>
          {contact.invoices.length === 0 && (
            <form action={deleteContact.bind(null, id)}><button className="btn-danger">Löschen</button></form>
          )}
        </div>
      </div>
      <ContactForm action={updateContact.bind(null, id)} contact={contact} />
      <div className="card overflow-x-auto p-0">
        <div className="px-5 pt-4 text-sm font-medium">Rechnungen</div>
        <table className="table mt-2">
          <thead><tr><th>Nummer</th><th>Datum</th><th>Status</th><th className="num">Brutto</th></tr></thead>
          <tbody>
            {contact.invoices.map((i) => (
              <tr key={i.id}>
                <td><Link className="text-accent hover:underline" href={`/rechnungen/${i.id}`}>{i.invoiceNumber ?? "Entwurf"}</Link></td>
                <td>{formatDate(i.invoiceDate)}</td>
                <td><StatusBadge status={i.status} overdue={isOverdue(i)} type={i.type} /></td>
                <td className="num">{formatCents(i.sumGross)}</td>
              </tr>
            ))}
            {contact.invoices.length === 0 && <tr><td colSpan={4} className="text-muted">Noch keine Rechnungen.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

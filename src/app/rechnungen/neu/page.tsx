import Link from "next/link";
import { db } from "@/lib/db";
import { contactName } from "@/lib/contacts";
import { createInvoiceDraft } from "@/app/actions/invoices";

export const dynamic = "force-dynamic";

export default async function NewInvoice() {
  const contacts = await db.contact.findMany({ where: { category: { not: "SUPPLIER" } }, orderBy: { customerNumber: "asc" } });
  return (
    <div className="space-y-4">
      <h1 className="h1">Neue Rechnung</h1>
      {contacts.length === 0 ? (
        <div className="card">Lege zuerst einen <Link href="/kontakte/neu" className="text-accent hover:underline">Kontakt</Link> an.</div>
      ) : (
        <form action={createInvoiceDraft} className="card max-w-md space-y-4">
          <div>
            <label className="label">Kunde</label>
            <select className="input" name="contactId" required>
              {contacts.map((c) => <option key={c.id} value={c.id}>{c.customerNumber} · {contactName(c)}</option>)}
            </select>
          </div>
          <button className="btn-primary">Entwurf anlegen</button>
        </form>
      )}
    </div>
  );
}

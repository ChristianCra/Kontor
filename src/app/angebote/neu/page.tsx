import Link from "next/link";
import { db } from "@/lib/db";
import { contactName } from "@/lib/contacts";
import { createOrderDraft } from "@/app/actions/orders";

export const dynamic = "force-dynamic";

export default async function NewOrder() {
  const contacts = await db.contact.findMany({ where: { category: { not: "SUPPLIER" } }, orderBy: { customerNumber: "asc" } });
  return (
    <div className="space-y-4">
      <h1 className="h1">Neues Angebot</h1>
      {contacts.length === 0 ? (
        <div className="card">Lege zuerst einen <Link href="/kontakte/neu" className="text-accent hover:underline">Kontakt</Link> an.</div>
      ) : (
        <form action={createOrderDraft} className="card max-w-md space-y-4">
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

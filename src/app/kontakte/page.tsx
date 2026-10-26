import Link from "next/link";
import { db } from "@/lib/db";
import { CONTACT_CATEGORY, contactName } from "@/lib/contacts";

export const dynamic = "force-dynamic";

export default async function Contacts({ searchParams }: { searchParams: Promise<{ q?: string; kategorie?: string }> }) {
  const { q = "", kategorie } = await searchParams;
  const contacts = await db.contact.findMany({
    where: {
      ...(kategorie ? { category: kategorie } : {}),
      ...(q
        ? { OR: [{ name: { contains: q } }, { firstName: { contains: q } }, { lastName: { contains: q } }, { customerNumber: { contains: q } }, { email: { contains: q } }] }
        : {}),
    },
    include: { addresses: true },
    orderBy: { customerNumber: "asc" },
  });
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="h1">Kontakte</h1>
        <Link href="/kontakte/neu" className="btn-primary">Neuer Kontakt</Link>
      </div>
      <form className="flex flex-wrap gap-2">
        <input className="input max-w-xs" name="q" placeholder="Suchen…" defaultValue={q} />
        <select className="input max-w-[12rem]" name="kategorie" defaultValue={kategorie ?? ""}>
          <option value="">Alle Kategorien</option>
          {Object.entries(CONTACT_CATEGORY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button className="btn">Filtern</button>
      </form>
      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead><tr><th>Nr.</th><th>Name</th><th>Kategorie</th><th>Ort</th><th>E-Mail</th></tr></thead>
          <tbody>
            {contacts.map((c) => (
              <tr key={c.id}>
                <td className="tabular-nums">{c.customerNumber}</td>
                <td><Link href={`/kontakte/${c.id}`} className="text-accent hover:underline">{contactName(c)}</Link></td>
                <td>{CONTACT_CATEGORY[c.category]}</td>
                <td>{c.addresses[0]?.city}</td>
                <td>{c.email}</td>
              </tr>
            ))}
            {contacts.length === 0 && <tr><td colSpan={5} className="text-muted">Keine Kontakte gefunden.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

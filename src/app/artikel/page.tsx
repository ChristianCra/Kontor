import Link from "next/link";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function Parts() {
  const parts = await db.part.findMany({ include: { unit: true }, orderBy: { partNumber: "asc" } });
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="h1">Artikel</h1>
        <Link href="/artikel/neu" className="btn-primary">Neuer Artikel</Link>
      </div>
      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead><tr><th>Nr.</th><th>Bezeichnung</th><th>Einheit</th><th className="num">Netto</th><th className="num">USt.</th><th>Status</th></tr></thead>
          <tbody>
            {parts.map((p) => (
              <tr key={p.id}>
                <td className="tabular-nums">{p.partNumber}</td>
                <td><Link href={`/artikel/${p.id}`} className="text-accent hover:underline">{p.name}</Link></td>
                <td>{p.unit.name}</td>
                <td className="num">{formatCents(p.priceNet)}</td>
                <td className="num">{p.taxRate} %</td>
                <td className="text-muted">{p.active ? "Aktiv" : "Inaktiv"}</td>
              </tr>
            ))}
            {parts.length === 0 && <tr><td colSpan={6} className="text-muted">Noch keine Artikel.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

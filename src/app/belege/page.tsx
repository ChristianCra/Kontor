import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { formatCents, formatDate } from "@/lib/money";
import { VOUCHER_STATUS } from "@/lib/vouchers";

export const dynamic = "force-dynamic";

const TABS: { key: string; label: string; where: Prisma.VoucherWhereInput }[] = [
  { key: "alle", label: "Alle", where: {} },
  { key: "entwurf", label: "Entwürfe", where: { status: 50 } },
  { key: "offen", label: "Offen", where: { status: { in: [100, 750] } } },
  { key: "bezahlt", label: "Bezahlt", where: { status: 1000 } },
];

export default async function Vouchers({ searchParams }: { searchParams: Promise<{ tab?: string; art?: string; q?: string }> }) {
  const { tab = "alle", art, q = "" } = await searchParams;
  const active = TABS.find((t) => t.key === tab) ?? TABS[0];
  const vouchers = await db.voucher.findMany({
    where: {
      ...active.where,
      ...(art === "D" || art === "C" ? { creditDebit: art } : {}),
      ...(q ? { OR: [{ supplierName: { contains: q } }, { documentNumber: { contains: q } }, { description: { contains: q } }] } : {}),
    },
    orderBy: [{ voucherDate: "desc" }, { id: "desc" }],
  });
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="h1">Belege</h1>
        <Link href="/belege/neu" className="btn-primary">Beleg erfassen</Link>
      </div>
      <div className="flex flex-wrap gap-1">
        {TABS.map((t) => <Link key={t.key} href={`/belege?tab=${t.key}${art ? `&art=${art}` : ""}`} className={t.key === active.key ? "btn-primary" : "btn"}>{t.label}</Link>)}
      </div>
      <form className="flex flex-wrap gap-2">
        <input type="hidden" name="tab" value={active.key} />
        <input className="input max-w-xs" name="q" placeholder="Lieferant, Nummer, Beschreibung" defaultValue={q} />
        <select className="input max-w-[10rem]" name="art" defaultValue={art ?? ""}>
          <option value="">Ein- und Ausgaben</option><option value="D">Ausgaben</option><option value="C">Einnahmen</option>
        </select>
        <button className="btn">Filtern</button>
      </form>
      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead><tr><th>Datum</th><th>Lieferant / Kunde</th><th>Belegnr.</th><th>Status</th><th>Datei</th><th className="num">Betrag</th></tr></thead>
          <tbody>
            {vouchers.map((v) => (
              <tr key={v.id}>
                <td>{formatDate(v.voucherDate)}</td>
                <td><Link className="text-accent hover:underline" href={`/belege/${v.id}`}>{v.supplierName || "(ohne Namen)"}</Link></td>
                <td>{v.documentNumber}</td>
                <td>{VOUCHER_STATUS[v.status]}</td>
                <td className="text-muted">{v.fileName ? "📎" : ""}</td>
                <td className={`num ${v.creditDebit === "D" ? "text-danger" : ""}`}>{v.creditDebit === "D" ? "−" : ""}{formatCents(v.sumGross)}</td>
              </tr>
            ))}
            {vouchers.length === 0 && <tr><td colSpan={6} className="text-muted">Keine Belege.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

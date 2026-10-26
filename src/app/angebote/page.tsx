import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { formatCents, formatDate } from "@/lib/money";
import { contactName } from "@/lib/contacts";
import { ORDER_STATUS, ORDER_TYPE } from "@/lib/orders";

export const dynamic = "force-dynamic";

const TABS: { key: string; label: string; where: Prisma.OrderWhereInput }[] = [
  { key: "alle", label: "Alle", where: {} },
  { key: "angebote", label: "Angebote", where: { type: "AN" } },
  { key: "auftraege", label: "Auftragsbestätigungen", where: { type: "AB" } },
  { key: "lieferscheine", label: "Lieferscheine", where: { type: "LI" } },
];

export default async function Orders({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = "alle" } = await searchParams;
  const active = TABS.find((t) => t.key === tab) ?? TABS[0];
  const orders = await db.order.findMany({ where: active.where, include: { contact: true }, orderBy: [{ orderDate: "desc" }, { id: "desc" }] });
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="h1">Angebote und Aufträge</h1>
        <Link href="/angebote/neu" className="btn-primary">Neues Angebot</Link>
      </div>
      <div className="flex gap-1 overflow-x-auto">
        {TABS.map((t) => <Link key={t.key} href={`/angebote?tab=${t.key}`} className={t.key === active.key ? "btn-primary" : "btn"}>{t.label}</Link>)}
      </div>
      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead><tr><th>Nummer</th><th>Art</th><th>Kunde</th><th>Datum</th><th>Status</th><th className="num">Brutto</th></tr></thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td><Link className="text-accent hover:underline" href={`/angebote/${o.id}`}>{o.orderNumber ?? "Entwurf"}</Link></td>
                <td className="text-muted">{ORDER_TYPE[o.type]}</td>
                <td>{contactName(o.contact)}</td>
                <td>{formatDate(o.orderDate)}</td>
                <td>{ORDER_STATUS[o.status]}</td>
                <td className="num">{o.type === "LI" ? "" : formatCents(o.sumGross)}</td>
              </tr>
            ))}
            {orders.length === 0 && <tr><td colSpan={6} className="text-muted">Keine Belege.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

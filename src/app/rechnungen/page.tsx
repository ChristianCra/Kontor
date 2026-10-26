import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { formatCents, formatDate } from "@/lib/money";
import { INVOICE_TYPE, dueDate, isOverdue } from "@/lib/invoices";
import { contactName } from "@/lib/contacts";
import { StatusBadge } from "@/components/StatusBadge";

export const dynamic = "force-dynamic";

const BILLABLE = ["RE", "AR", "TR", "ER"];

const TABS: { key: string; label: string; where: Prisma.InvoiceWhereInput }[] = [
  { key: "alle", label: "Alle", where: {} },
  { key: "entwurf", label: "Entwürfe", where: { status: 100 } },
  { key: "offen", label: "Offen", where: { status: { in: [200, 750] }, type: { in: BILLABLE } } },
  { key: "bezahlt", label: "Bezahlt", where: { status: 1000, type: { in: BILLABLE } } },
  { key: "gutschriften", label: "Gutschriften", where: { type: "GU" } },
  { key: "mahnungen", label: "Mahnungen", where: { type: "MA" } },
];

export default async function Invoices({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = "alle" } = await searchParams;
  const active = TABS.find((t) => t.key === tab) ?? TABS[0];
  const invoices = await db.invoice.findMany({
    where: active.where,
    include: { contact: true },
    orderBy: [{ invoiceDate: "desc" }, { id: "desc" }],
  });
  const sum = invoices.filter((i) => i.type !== "MA").reduce((s, i) => s + (i.type === "GU" ? -i.sumGross : i.sumGross), 0);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="h1">Rechnungen</h1>
        <Link href="/rechnungen/neu" className="btn-primary">Neue Rechnung</Link>
      </div>
      <div className="flex gap-1 overflow-x-auto">
        {TABS.map((t) => (
          <Link key={t.key} href={`/rechnungen?tab=${t.key}`} className={t.key === active.key ? "btn-primary" : "btn"}>{t.label}</Link>
        ))}
      </div>
      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead><tr><th>Nummer</th><th>Art</th><th>Kunde</th><th>Datum</th><th>Fällig</th><th>Status</th><th className="num">Brutto</th><th className="num">Offen</th></tr></thead>
          <tbody>
            {invoices.map((i) => (
              <tr key={i.id}>
                <td><Link className="text-accent hover:underline" href={`/rechnungen/${i.id}`}>{i.invoiceNumber ?? "Entwurf"}</Link></td>
                <td className="text-muted">{INVOICE_TYPE[i.type]}</td>
                <td>{contactName(i.contact)}</td>
                <td>{formatDate(i.invoiceDate)}</td>
                <td>{BILLABLE.includes(i.type) ? formatDate(dueDate(i)) : ""}</td>
                <td><StatusBadge status={i.status} overdue={isOverdue(i)} type={i.type} /></td>
                <td className="num">{formatCents(i.sumGross)}</td>
                <td className="num">{BILLABLE.includes(i.type) && (i.status === 200 || i.status === 750) ? formatCents(i.sumGross - i.paidAmount) : ""}</td>
              </tr>
            ))}
            {invoices.length === 0 && <tr><td colSpan={8} className="text-muted">Keine Rechnungen.</td></tr>}
          </tbody>
          {invoices.length > 0 && (
            <tfoot><tr><td colSpan={6} className="text-muted">{invoices.length} Belege</td><td className="num font-medium">{formatCents(sum)}</td><td /></tr></tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

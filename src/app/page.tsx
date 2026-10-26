import Link from "next/link";
import { db } from "@/lib/db";
import { formatCents, formatDate } from "@/lib/money";
import { isOverdue } from "@/lib/invoices";
import { contactName } from "@/lib/contacts";
import { StatusBadge } from "@/components/StatusBadge";
import { getCompany } from "@/lib/company";
import { loadJournal } from "@/lib/journal-data";
import { periodFor } from "@/lib/journal";
import { computeUstva } from "@/lib/ustva";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const year = new Date().getFullYear();
  const [open, paidThisYear, latest] = await Promise.all([
    db.invoice.findMany({ where: { status: { in: [200, 750] }, type: { in: ["RE", "AR", "TR", "ER"] } } }),
    db.payment.aggregate({ _sum: { amount: true }, where: { date: { gte: new Date(year, 0, 1) }, invoice: { type: { in: ["RE", "AR", "TR", "ER"] } } } }),
    db.invoice.findMany({ orderBy: { updatedAt: "desc" }, take: 8, include: { contact: true } }),
  ]);
  const company = await getCompany();
  const now = new Date();
  const vatKind = company.vatPeriod as "MONTH" | "QUARTER" | "YEAR";
  const vatIndex = vatKind === "QUARTER" ? Math.floor(now.getMonth() / 3) + 1 : vatKind === "MONTH" ? now.getMonth() + 1 : 1;
  const vatPeriod = periodFor(vatKind, year, vatIndex);
  const ustva = computeUstva(await loadJournal(company.chartOfAccounts as "skr03" | "skr04"), vatPeriod, company.cashAccounting);
  const openSum = open.reduce((s, i) => s + i.sumGross - i.paidAmount, 0);
  const overdue = open.filter((i) => isOverdue(i));
  const overdueSum = overdue.reduce((s, i) => s + i.sumGross - i.paidAmount, 0);

  const tiles = [
    { label: "Offene Forderungen", value: formatCents(openSum), hint: `${open.length} Rechnungen` },
    { label: "Davon überfällig", value: formatCents(overdueSum), hint: `${overdue.length} Rechnungen`, danger: overdue.length > 0 },
    { label: `Zahlungseingänge ${year}`, value: formatCents(paidThisYear._sum.amount ?? 0), hint: "brutto" },
    ...(company.smallBusiness
      ? []
      : [{ label: "Umsatzsteuer-Zahllast (laufender Zeitraum)", value: formatCents(ustva.payable), hint: `fällig am ${formatDate(new Date(vatPeriod.to.getFullYear(), vatPeriod.to.getMonth(), 10))}`, href: "/steuern/ustva" }]),
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="h1">Übersicht</h1>
        <Link href="/rechnungen/neu" className="btn-primary">Neue Rechnung</Link>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="card">
            <div className="text-xs text-muted">{t.label}</div>
            <div className={`mt-1 text-2xl font-semibold tabular-nums ${t.danger ? "text-danger" : ""}`}>{t.value}</div>
            <div className="text-xs text-muted">{"href" in t && t.href ? <Link className="text-accent hover:underline" href={t.href}>{t.hint}</Link> : t.hint}</div>
          </div>
        ))}
      </div>
      <div className="card overflow-x-auto p-0">
        <div className="px-5 pt-4 text-sm font-medium">Zuletzt bearbeitet</div>
        <table className="table mt-2">
          <thead>
            <tr><th>Nummer</th><th>Kunde</th><th>Datum</th><th>Status</th><th className="num">Brutto</th></tr>
          </thead>
          <tbody>
            {latest.map((i) => (
              <tr key={i.id}>
                <td><Link className="text-accent hover:underline" href={`/rechnungen/${i.id}`}>{i.invoiceNumber ?? "Entwurf"}</Link></td>
                <td>{contactName(i.contact)}</td>
                <td>{formatDate(i.invoiceDate)}</td>
                <td><StatusBadge status={i.status} overdue={isOverdue(i)} type={i.type} /></td>
                <td className="num">{formatCents(i.sumGross)}</td>
              </tr>
            ))}
            {latest.length === 0 && <tr><td colSpan={5} className="text-muted">Noch keine Rechnungen.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

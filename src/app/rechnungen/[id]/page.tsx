import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { formatCents, formatDate } from "@/lib/money";
import { INVOICE_TYPE, TAX_TYPES, dueDate, isOverdue } from "@/lib/invoices";
import { contactName } from "@/lib/contacts";
import { computeTotals } from "@/lib/calc";
import { StatusBadge } from "@/components/StatusBadge";
import { DocumentEditor } from "@/components/DocumentEditor";
import { InvoiceActions } from "@/components/InvoiceActions";
import { deleteDraft, saveAndFinalize, saveDraft } from "@/app/actions/invoices";

export const dynamic = "force-dynamic";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const inv = await db.invoice.findUnique({
    where: { id },
    include: {
      positions: { orderBy: { position: "asc" } },
      contact: true,
      payments: { orderBy: { date: "asc" } },
      cancels: true,
      cancelledBy: true,
      parent: true,
      children: { orderBy: { id: "asc" } },
      order: true,
    },
  });
  if (!inv) notFound();

  const title = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h1 className="h1">{inv.invoiceNumber ? inv.header : `${inv.type === "MA" ? inv.header : INVOICE_TYPE[inv.type]} (Entwurf)`}</h1>
        <div className="flex items-center gap-2 text-sm text-muted">
          <Link href={`/kontakte/${inv.contactId}`} className="hover:underline">{contactName(inv.contact)}</Link>
          <StatusBadge status={inv.status} overdue={isOverdue(inv)} type={inv.type} />
          {inv.enshrinedAt && <span>festgeschrieben am {formatDate(inv.enshrinedAt)}</span>}
        </div>
      </div>
      {inv.status === 100 && (
        <form action={deleteDraft.bind(null, id)}><button className="btn-danger">Entwurf löschen</button></form>
      )}
    </div>
  );

  if (inv.status === 100) {
    const parts = await db.part.findMany({ where: { active: true }, include: { unit: true }, orderBy: { partNumber: "asc" } });
    return (
      <div className="space-y-4">
        {title}
        <DocumentEditor
          kind="invoice"
          doc={{ ...inv, date: inv.invoiceDate }}
          parts={parts}
          pdfUrl={`/rechnungen/${id}/pdf`}
          finalizeLabel="Abschließen und Nummer vergeben"
          save={saveDraft}
          finalize={saveAndFinalize}
        />
      </div>
    );
  }

  const totals = computeTotals(inv.positions, inv.taxType, inv.discount);
  return (
    <div className="space-y-4">
      {title}
      {inv.cancels && <div className="text-sm">Storniert Rechnung <Link className="text-accent hover:underline" href={`/rechnungen/${inv.cancels.id}`}>{inv.cancels.invoiceNumber}</Link></div>}
      {inv.cancelledBy && <div className="text-sm">Storniert durch <Link className="text-accent hover:underline" href={`/rechnungen/${inv.cancelledBy.id}`}>{inv.cancelledBy.invoiceNumber}</Link></div>}
      {inv.parent && <div className="text-sm">Bezieht sich auf <Link className="text-accent hover:underline" href={`/rechnungen/${inv.parent.id}`}>{inv.parent.invoiceNumber}</Link></div>}
      {inv.order && <div className="text-sm">Aus <Link className="text-accent hover:underline" href={`/angebote/${inv.order.id}`}>{inv.order.header}</Link></div>}
      {inv.children.length > 0 && (
        <div className="text-sm">
          Folgebelege:{" "}
          {inv.children.map((c, i) => (
            <span key={c.id}>{i > 0 && ", "}<Link className="text-accent hover:underline" href={`/rechnungen/${c.id}`}>{c.invoiceNumber ? c.header : `${INVOICE_TYPE[c.type]} (Entwurf)`}</Link></span>
          ))}
        </div>
      )}
      <InvoiceActions
        id={id}
        status={inv.status}
        type={inv.type}
        open={inv.sumGross - inv.paidAmount}
        enshrined={!!inv.enshrinedAt}
        sent={!!inv.sentAt}
        hasPayments={inv.payments.length > 0}
        cancelled={!!inv.cancelledBy}
        overdue={isOverdue(inv)}
        dunningLevel={inv.dunningLevel}
        eInvoice={inv.eInvoice}
      />
      <div className="grid gap-4 md:grid-cols-3">
        <div className="card text-sm"><div className="label">Empfänger</div><pre className="whitespace-pre-wrap font-sans">{inv.address}</pre></div>
        <div className="card space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-muted">Datum</span><span>{formatDate(inv.invoiceDate)}</span></div>
          {inv.type !== "SR" && <div className="flex justify-between"><span className="text-muted">Fällig</span><span>{formatDate(dueDate(inv))}</span></div>}
          {inv.dunningLevel > 0 && inv.type !== "MA" && <div className="flex justify-between"><span className="text-muted">Mahnstufe</span><span>{inv.dunningLevel}</span></div>}
          <div className="flex justify-between"><span className="text-muted">Versendet</span><span>{inv.sentAt ? formatDate(inv.sentAt) : "nein"}</span></div>
          <div className="flex justify-between"><span className="text-muted">Besteuerung</span><span className="text-right">{TAX_TYPES[inv.taxType]}</span></div>
        </div>
        <div className="card space-y-1 text-sm tabular-nums">
          <div className="flex justify-between"><span>Netto</span><span>{formatCents(inv.sumNet)}</span></div>
          <div className="flex justify-between"><span>USt.</span><span>{formatCents(inv.sumTax)}</span></div>
          <div className="flex justify-between font-semibold"><span>Brutto</span><span>{formatCents(inv.sumGross)}</span></div>
          {!["SR", "MA"].includes(inv.type) && <div className="flex justify-between text-muted"><span>{inv.type === "GU" ? "Erstattet" : "Bezahlt"}</span><span>{formatCents(inv.paidAmount)}</span></div>}
        </div>
      </div>
      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead><tr><th>Pos.</th><th>Bezeichnung</th><th className="num">Menge</th><th className="num">Einzelpreis</th><th className="num">USt.</th><th className="num">Gesamt netto</th></tr></thead>
          <tbody>
            {inv.positions.map((p, i) => (
              <tr key={p.id}>
                <td>{i + 1}</td>
                <td>{p.name}{p.text && <div className="text-xs text-muted">{p.text}</div>}</td>
                <td className="num">{p.quantity.toLocaleString("de-DE")} {p.unit}</td>
                <td className="num">{formatCents(p.priceNet)}{p.discount ? ` −${p.discount} %` : ""}</td>
                <td className="num">{p.taxRate} %</td>
                <td className="num">{formatCents(totals.positions[i])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {inv.payments.length > 0 && (
        <div className="card overflow-x-auto p-0">
          <div className="px-5 pt-4 text-sm font-medium">Zahlungen</div>
          <table className="table mt-2">
            <thead><tr><th>Datum</th><th>Notiz</th><th className="num">Betrag</th></tr></thead>
            <tbody>{inv.payments.map((p) => <tr key={p.id}><td>{formatDate(p.date)}</td><td>{p.note}</td><td className="num">{formatCents(p.amount)}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

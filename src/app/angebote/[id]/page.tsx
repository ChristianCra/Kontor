import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { formatCents, formatDate } from "@/lib/money";
import { contactName } from "@/lib/contacts";
import { computeTotals } from "@/lib/calc";
import { ORDER_STATUS, ORDER_TYPE } from "@/lib/orders";
import { TAX_TYPES } from "@/lib/invoices";
import { DocumentEditor } from "@/components/DocumentEditor";
import { OrderActions } from "@/components/OrderActions";
import { deleteOrderDraft, saveAndFinalizeOrder, saveOrderDraft } from "@/app/actions/orders";

export const dynamic = "force-dynamic";

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const o = await db.order.findUnique({
    where: { id },
    include: { positions: { orderBy: { position: "asc" } }, contact: true, parent: true, children: true, invoices: true },
  });
  if (!o) notFound();

  const title = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h1 className="h1">{o.orderNumber ? o.header : `${ORDER_TYPE[o.type]} (Entwurf)`}</h1>
        <div className="flex items-center gap-2 text-sm text-muted">
          <Link href={`/kontakte/${o.contactId}`} className="hover:underline">{contactName(o.contact)}</Link>
          <span className="rounded bg-gray-500/15 px-2 py-0.5 text-xs font-medium">{ORDER_STATUS[o.status]}</span>
        </div>
      </div>
      {o.status === 100 && <form action={deleteOrderDraft.bind(null, id)}><button className="btn-danger">Entwurf löschen</button></form>}
    </div>
  );

  if (o.status === 100) {
    const parts = await db.part.findMany({ where: { active: true }, include: { unit: true }, orderBy: { partNumber: "asc" } });
    return (
      <div className="space-y-4">
        {title}
        <DocumentEditor
          kind="order"
          doc={{ ...o, date: o.orderDate }}
          parts={parts}
          pdfUrl={`/angebote/${id}/pdf`}
          finalizeLabel="Abschließen und Nummer vergeben"
          save={saveOrderDraft}
          finalize={saveAndFinalizeOrder}
        />
      </div>
    );
  }

  const totals = computeTotals(o.positions, o.taxType, o.discount);
  const related = [
    ...(o.parent ? [{ href: `/angebote/${o.parent.id}`, label: o.parent.header }] : []),
    ...o.children.map((c) => ({ href: `/angebote/${c.id}`, label: c.orderNumber ? c.header : `${ORDER_TYPE[c.type]} (Entwurf)` })),
    ...o.invoices.map((i) => ({ href: `/rechnungen/${i.id}`, label: i.invoiceNumber ? i.header : "Rechnung (Entwurf)" })),
  ];
  return (
    <div className="space-y-4">
      {title}
      <OrderActions id={id} type={o.type} status={o.status} sent={!!o.sentAt} hasFollowUps={o.children.length + o.invoices.length > 0} />
      {related.length > 0 && (
        <div className="text-sm">
          Verknüpfte Belege:{" "}
          {related.map((r, i) => <span key={r.href}>{i > 0 && ", "}<Link className="text-accent hover:underline" href={r.href}>{r.label}</Link></span>)}
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="card text-sm"><div className="label">Empfänger</div><pre className="whitespace-pre-wrap font-sans">{o.address}</pre></div>
        <div className="card space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-muted">Datum</span><span>{formatDate(o.orderDate)}</span></div>
          {o.validUntil && o.type === "AN" && <div className="flex justify-between"><span className="text-muted">Gültig bis</span><span>{formatDate(o.validUntil)}</span></div>}
          <div className="flex justify-between"><span className="text-muted">Versendet</span><span>{o.sentAt ? formatDate(o.sentAt) : "nein"}</span></div>
          <div className="flex justify-between"><span className="text-muted">Besteuerung</span><span className="text-right">{TAX_TYPES[o.taxType]}</span></div>
        </div>
        <div className="card space-y-1 text-sm tabular-nums">
          <div className="flex justify-between"><span>Netto</span><span>{formatCents(o.sumNet)}</span></div>
          <div className="flex justify-between"><span>USt.</span><span>{formatCents(o.sumTax)}</span></div>
          <div className="flex justify-between font-semibold"><span>Brutto</span><span>{formatCents(o.sumGross)}</span></div>
        </div>
      </div>
      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead><tr><th>Pos.</th><th>Bezeichnung</th><th className="num">Menge</th><th className="num">Einzelpreis</th><th className="num">Gesamt netto</th></tr></thead>
          <tbody>
            {o.positions.map((p, i) => (
              <tr key={p.id} className={p.optional ? "text-muted" : ""}>
                <td>{i + 1}</td>
                <td>{p.name}{p.optional && " (optional)"}{p.text && <div className="text-xs text-muted">{p.text}</div>}</td>
                <td className="num">{p.quantity.toLocaleString("de-DE")} {p.unit}</td>
                <td className="num">{formatCents(p.priceNet)}</td>
                <td className="num">{formatCents(totals.positions[i])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

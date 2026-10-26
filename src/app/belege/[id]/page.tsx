import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { ensureAccountingTypes } from "@/lib/accounts";
import { getCompany } from "@/lib/company";
import { formatCents, formatDate } from "@/lib/money";
import { VOUCHER_STATUS, VOUCHER_TAX_TYPES, findDuplicate } from "@/lib/vouchers";
import { VoucherForm } from "@/components/VoucherForm";
import { VoucherActions } from "@/components/VoucherActions";
import { deleteVoucher } from "@/app/actions/vouchers";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function VoucherPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  await ensureAccountingTypes();
  const [v, company] = await Promise.all([
    db.voucher.findUnique({
      where: { id },
      include: { positions: { include: { accountingType: true } }, payments: { include: { transaction: true }, orderBy: { date: "asc" } } },
    }),
    getCompany(),
  ]);
  if (!v) notFound();
  const chart = company.chartOfAccounts as "skr03" | "skr04";
  const duplicate = await findDuplicate(v.id, v.fileHash);

  const preview = v.filePath && (
    <div className="card p-2">
      {v.fileType === "application/pdf" ? (
        <iframe title="Beleg" src={`/belege/${id}/datei`} className="h-[70vh] w-full rounded" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="Beleg" src={`/belege/${id}/datei`} className="max-h-[70vh] w-full object-contain" />
      )}
    </div>
  );

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h1 className="h1">{v.creditDebit === "D" ? "Ausgabe" : "Einnahme"}: {v.supplierName || "Neuer Beleg"}</h1>
        <div className="text-sm text-muted">{VOUCHER_STATUS[v.status]}{v.enshrinedAt ? ` · festgeschrieben am ${formatDate(v.enshrinedAt)}` : ""}</div>
      </div>
      {v.status === 50 && <form action={deleteVoucher.bind(null, id)}><button className="btn-danger">Löschen</button></form>}
    </div>
  );
  const dupWarning = duplicate && (
    <div className="rounded-md border border-amber-500 p-3 text-sm">
      Diese Datei wurde bereits hochgeladen: <Link className="text-accent hover:underline" href={`/belege/${duplicate.id}`}>{duplicate.supplierName || `Beleg ${duplicate.id}`}</Link>. Prüfe, ob es sich um eine Dublette handelt.
    </div>
  );

  if (v.status === 50) {
    const [contacts, accountingTypes] = await Promise.all([
      db.contact.findMany({ orderBy: { customerNumber: "asc" } }),
      db.accountingType.findMany({ where: { active: true }, orderBy: { skr03: "asc" } }),
    ]);
    return (
      <div className="space-y-4">
        {header}
        {dupWarning}
        <div className="grid gap-4 xl:grid-cols-2">
          <VoucherForm voucher={v} contacts={contacts} accountingTypes={accountingTypes} chart={chart} />
          {preview}
        </div>
      </div>
    );
  }

  const accounts = await db.bankAccount.findMany({ orderBy: { id: "asc" } });
  return (
    <div className="space-y-4">
      {header}
      {dupWarning}
      <VoucherActions id={id} status={v.status} open={v.sumGross - v.paidAmount} enshrined={!!v.enshrinedAt} hasPayments={v.payments.length > 0} accounts={accounts} />
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="space-y-4">
          <div className="card grid gap-2 text-sm sm:grid-cols-2">
            <div><span className="text-muted">Belegnummer: </span>{v.documentNumber || "–"}</div>
            <div><span className="text-muted">Belegdatum: </span>{formatDate(v.voucherDate)}</div>
            <div><span className="text-muted">Fällig: </span>{formatDate(v.dueDate) || "–"}</div>
            <div><span className="text-muted">Steuerregel: </span>{VOUCHER_TAX_TYPES[v.creditDebit as "D" | "C"][v.taxType]}</div>
            {v.description && <div className="sm:col-span-2"><span className="text-muted">Beschreibung: </span>{v.description}</div>}
          </div>
          <div className="card overflow-x-auto p-0">
            <table className="table">
              <thead><tr><th>Konto</th><th className="num">Netto</th><th className="num">USt.</th><th className="num">Brutto</th></tr></thead>
              <tbody>
                {v.positions.map((p) => (
                  <tr key={p.id}>
                    <td>{p.accountingType[chart]} · {p.accountingType.name}{p.comment && <div className="text-xs text-muted">{p.comment}</div>}</td>
                    <td className="num">{formatCents(p.sumNet)}</td>
                    <td className="num">{formatCents(p.sumTax)} <span className="text-muted">({p.taxRate} %)</span></td>
                    <td className="num">{formatCents(p.sumGross)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td className="font-medium">Summe</td><td className="num">{formatCents(v.sumNet)}</td><td className="num">{formatCents(v.sumTax)}</td><td className="num font-semibold">{formatCents(v.sumGross)}</td></tr></tfoot>
            </table>
          </div>
          {v.payments.length > 0 && (
            <div className="card overflow-x-auto p-0">
              <div className="px-5 pt-4 text-sm font-medium">Zahlungen</div>
              <table className="table mt-2">
                <thead><tr><th>Datum</th><th>Quelle</th><th className="num">Betrag</th></tr></thead>
                <tbody>{v.payments.map((p) => <tr key={p.id}><td>{formatDate(p.date)}</td><td>{p.transaction ? `Bankumsatz: ${p.transaction.payeeName}` : p.note || "manuell"}</td><td className="num">{formatCents(p.amount)}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </div>
        {preview}
      </div>
    </div>
  );
}

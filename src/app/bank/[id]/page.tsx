import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { formatCents, formatDate } from "@/lib/money";
import { accountBalances } from "@/lib/balances";
import { ensureAccountingTypes } from "@/lib/accounts";
import { getCompany } from "@/lib/company";
import { loadOpenItems } from "@/lib/openitems";
import { suggestMatches } from "@/lib/matching";
import { BankImport } from "@/components/BankImport";
import { TransactionRow } from "@/components/TransactionRow";

export const dynamic = "force-dynamic";

const FILTERS = [
  { key: "offen", label: "Offen", status: [100] },
  { key: "alle", label: "Alle", status: undefined },
  { key: "zugeordnet", label: "Zugeordnet", status: [200, 400] },
  { key: "privat", label: "Privat", status: [300] },
];

export default async function AccountPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ f?: string }> }) {
  const id = Number((await params).id);
  const { f = "offen" } = await searchParams;
  const filter = FILTERS.find((x) => x.key === f) ?? FILTERS[0];
  await ensureAccountingTypes();
  const account = await db.bankAccount.findUnique({ where: { id } });
  if (!account) notFound();
  const [transactions, balances, openItems, accountingTypes, company] = await Promise.all([
    db.transaction.findMany({
      where: { accountId: id, ...(filter.status ? { status: { in: filter.status } } : {}) },
      include: { payments: { include: { invoice: true, voucher: true } } },
      orderBy: [{ valueDate: "desc" }, { id: "desc" }],
      take: 200,
    }),
    accountBalances(),
    loadOpenItems(),
    db.accountingType.findMany({ where: { active: true }, orderBy: { skr03: "asc" } }),
    getCompany(),
  ]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <Link href="/bank" className="text-sm text-muted hover:underline">← Bank und Kasse</Link>
          <h1 className="h1">{account.name}</h1>
          <div className="text-sm text-muted">{account.iban || (account.type === "CASH" ? "Kasse" : "")}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted">Saldo</div>
          <div className="text-2xl font-semibold tabular-nums">{formatCents(balances.get(id) ?? 0)}</div>
        </div>
      </div>
      <BankImport accountId={id} cash={account.type === "CASH"} />
      <div className="flex flex-wrap gap-1">
        {FILTERS.map((x) => <Link key={x.key} href={`/bank/${id}?f=${x.key}`} className={x.key === filter.key ? "btn-primary" : "btn"}>{x.label}</Link>)}
      </div>
      <div className="card p-0">
        {transactions.map((t) => (
          <TransactionRow
            key={t.id}
            accountId={id}
            tx={{
              id: t.id,
              date: formatDate(t.valueDate),
              amount: t.amount,
              payeeName: t.payeeName,
              purpose: t.purpose,
              status: t.status,
              linked: t.payments.map((p) =>
                p.invoice
                  ? { label: p.invoice.invoiceNumber ?? "Rechnung", href: `/rechnungen/${p.invoice.id}` }
                  : { label: p.voucher?.supplierName || "Beleg", href: `/belege/${p.voucherId}` },
              ),
            }}
            suggestions={t.status === 100 ? suggestMatches(t, openItems) : []}
            candidates={openItems}
            accountingTypes={accountingTypes}
            chart={company.chartOfAccounts as "skr03" | "skr04"}
          />
        ))}
        {transactions.length === 0 && <div className="p-4 text-sm text-muted">Keine Umsätze.</div>}
      </div>
    </div>
  );
}

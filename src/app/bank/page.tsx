import Link from "next/link";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { accountBalances } from "@/lib/balances";
import { addPrivateRule, createAccount, deletePrivateRule } from "@/app/actions/bank";

export const dynamic = "force-dynamic";

export default async function Bank() {
  const [accounts, balances, openCounts, rules] = await Promise.all([
    db.bankAccount.findMany({ orderBy: { id: "asc" } }),
    accountBalances(),
    db.transaction.groupBy({ by: ["accountId"], where: { status: 100 }, _count: true }),
    db.privateRule.findMany({ orderBy: { id: "asc" } }),
  ]);
  return (
    <div className="space-y-6">
      <h1 className="h1">Bank und Kasse</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {accounts.map((a) => (
          <Link key={a.id} href={`/bank/${a.id}`} className="card hover:border-accent">
            <div className="text-sm text-muted">{a.type === "CASH" ? "Kasse" : "Bankkonto"} · Konto {a.ledgerAccount}</div>
            <div className="font-medium">{a.name}</div>
            <div className="mt-2 text-2xl font-semibold tabular-nums">{formatCents(balances.get(a.id) ?? 0)}</div>
            <div className="text-xs text-muted">{openCounts.find((c) => c.accountId === a.id)?._count ?? 0} offene Umsätze</div>
          </Link>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <form action={createAccount} className="card grid gap-3 sm:grid-cols-2">
          <div className="text-sm font-medium sm:col-span-2">Neues Zahlungskonto</div>
          <div><label className="label">Name</label><input className="input" name="name" required /></div>
          <div><label className="label">Art</label><select className="input" name="type"><option value="BANK">Bankkonto (Import)</option><option value="CASH">Kasse</option></select></div>
          <div><label className="label">IBAN</label><input className="input" name="iban" /></div>
          <div><label className="label">BIC</label><input className="input" name="bic" /></div>
          <div><label className="label">Anfangssaldo</label><input className="input text-right" name="openingBalance" inputMode="decimal" defaultValue="0,00" /></div>
          <div><label className="label">zum</label><input className="input" type="date" name="openingDate" defaultValue={new Date().toISOString().slice(0, 10)} /></div>
          <button className="btn-primary sm:col-span-2">Anlegen</button>
        </form>
        <div className="card space-y-3">
          <div className="text-sm font-medium">Privat-Regeln</div>
          <p className="text-xs text-muted">Importierte Umsätze, die passen, werden automatisch als privat markiert.</p>
          <ul className="space-y-1 text-sm">
            {rules.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2">
                <span>{[r.payeeName && `Name enthält „${r.payeeName}“`, r.purpose && `Zweck enthält „${r.purpose}“`].filter(Boolean).join(" und ")}</span>
                <form action={deletePrivateRule.bind(null, r.id)}><button className="text-xs text-danger">Löschen</button></form>
              </li>
            ))}
            {rules.length === 0 && <li className="text-muted">Keine Regeln.</li>}
          </ul>
          <form action={addPrivateRule} className="flex flex-wrap gap-2">
            <input className="input max-w-[12rem]" name="payeeName" placeholder="Gegenpartei enthält" />
            <input className="input max-w-[12rem]" name="purpose" placeholder="Zweck enthält" />
            <button className="btn">Hinzufügen</button>
          </form>
        </div>
      </div>
    </div>
  );
}

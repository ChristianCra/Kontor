"use client";

import { useState, useTransition } from "react";
import type { AccountingType } from "@prisma/client";
import { link, markPrivate, unlink, voucherFromTransaction } from "@/app/actions/bank";
import type { ActionResult } from "@/lib/draft";
import type { OpenItem, Suggestion } from "@/lib/matching";
import { formatCents } from "@/lib/money";

const KIND_LABEL: Record<OpenItem["kind"], string> = { invoice: "Rechnung", credit: "Gutschrift", voucher: "Beleg", income: "Einnahme" };

type Props = {
  accountId: number;
  tx: { id: number; date: string; amount: number; payeeName: string; purpose: string; status: number; linked: { label: string; href: string }[] };
  suggestions: Suggestion[];
  candidates: OpenItem[];
  accountingTypes: AccountingType[];
  chart: "skr03" | "skr04";
};

export function TransactionRow({ accountId, tx, suggestions, candidates, accountingTypes, chart }: Props) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const [mode, setMode] = useState<"none" | "pick" | "book">("none");
  const [pick, setPick] = useState("");
  const [typeId, setTypeId] = useState(accountingTypes[0]?.id ?? 0);
  const call = (fn: () => Promise<ActionResult>) => {
    setError(undefined);
    start(async () => {
      const r = await fn();
      if (r?.error) setError(r.error);
      else setMode("none");
    });
  };
  const open = tx.status === 100;
  const incoming = tx.amount > 0;
  const own = candidates.filter((c) => (incoming ? c.kind === "invoice" || c.kind === "income" : c.kind === "voucher" || c.kind === "credit"));
  const types = accountingTypes.filter((a) => (incoming ? a.kind === "REVENUE" : a.kind === "EXPENSE") || a.kind === "PRIVATE");
  return (
    <div className="border-b border-border p-3 text-sm last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-medium">{tx.payeeName || "(ohne Namen)"} <span className="font-normal text-muted">· {tx.date}</span></div>
          <div className="truncate text-xs text-muted">{tx.purpose}</div>
        </div>
        <div className={`tabular-nums font-semibold ${incoming ? "text-emerald-600 dark:text-emerald-400" : ""}`}>{formatCents(tx.amount)}</div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {tx.status === 200 && (
          <>
            <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-xs">Zugeordnet:</span>
            {tx.linked.map((l) => <a key={l.href} href={l.href} className="text-xs text-accent hover:underline">{l.label}</a>)}
            <button className="text-xs text-muted hover:underline" disabled={pending} onClick={() => call(() => unlink(accountId, tx.id))}>Zuordnung aufheben</button>
          </>
        )}
        {tx.status === 300 && (
          <>
            <span className="rounded bg-gray-500/15 px-2 py-0.5 text-xs">Privat</span>
            <button className="text-xs text-muted hover:underline" disabled={pending} onClick={() => call(() => markPrivate(accountId, tx.id, false))}>Rückgängig</button>
          </>
        )}
        {open && suggestions.map((s) => (
          <button key={`${s.kind}${s.id}`} className="btn text-xs" disabled={pending} onClick={() => call(() => link(accountId, tx.id, { kind: s.kind, id: s.id }))} title={s.reasons.join(", ")}>
            ✓ {KIND_LABEL[s.kind]} {s.number || s.name} ({formatCents(s.open)}) · {s.reasons.join(", ")}
          </button>
        ))}
        {open && (
          <>
            <button className="text-xs text-accent hover:underline" onClick={() => setMode(mode === "pick" ? "none" : "pick")}>Manuell zuordnen</button>
            <button className="text-xs text-accent hover:underline" onClick={() => setMode(mode === "book" ? "none" : "book")}>Ohne Beleg buchen</button>
            <button className="text-xs text-muted hover:underline" disabled={pending} onClick={() => call(() => markPrivate(accountId, tx.id, true))}>Privat</button>
          </>
        )}
      </div>
      {mode === "pick" && (
        <div className="mt-2 flex flex-wrap gap-2">
          <select className="input max-w-md" value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">Offenen Posten wählen…</option>
            {own.map((c) => <option key={`${c.kind}:${c.id}`} value={`${c.kind}:${c.id}`}>{KIND_LABEL[c.kind]} {c.number} · {c.name} · offen {formatCents(c.open)}</option>)}
          </select>
          <button className="btn-primary" disabled={!pick || pending} onClick={() => { const [kind, id] = pick.split(":"); call(() => link(accountId, tx.id, { kind: kind as OpenItem["kind"], id: Number(id) })); }}>Zuordnen</button>
        </div>
      )}
      {mode === "book" && (
        <div className="mt-2 flex flex-wrap gap-2">
          <select className="input max-w-md" value={typeId} onChange={(e) => setTypeId(Number(e.target.value))}>
            {types.map((a) => <option key={a.id} value={a.id}>{a[chart]} · {a.name}</option>)}
          </select>
          <button className="btn-primary" disabled={pending} onClick={() => { const t = types.find((a) => a.id === typeId) ?? types[0]; call(() => voucherFromTransaction(accountId, tx.id, t.id, t.defaultTaxRate)); }}>Beleg anlegen und zuordnen</button>
        </div>
      )}
      {error && <div className="mt-1 text-xs text-danger">{error}</div>}
    </div>
  );
}

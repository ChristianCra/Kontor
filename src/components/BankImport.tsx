"use client";

import { useActionState } from "react";
import { addManualTransaction, importTransactions, type ImportResult } from "@/app/actions/bank";
import type { ActionResult } from "@/lib/draft";

export function BankImport({ accountId, cash }: { accountId: number; cash: boolean }) {
  const [state, action, pending] = useActionState<ImportResult, FormData>(importTransactions.bind(null, accountId), {});
  const [mState, mAction, mPending] = useActionState<ActionResult, FormData>(addManualTransaction.bind(null, accountId), {});
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {!cash && (
        <form action={action} className="card space-y-3">
          <div className="text-sm font-medium">Kontoauszug importieren</div>
          <p className="text-xs text-muted">CSV-Export deines Onlinebankings oder camt.053 (XML). Bereits importierte Umsätze werden übersprungen.</p>
          <input type="file" name="file" accept=".csv,.txt,.xml" className="text-sm" />
          <button className="btn-primary" disabled={pending}>Importieren</button>
          {state.error && <div className="text-sm text-danger">{state.error}</div>}
          {state.imported !== undefined && <div className="text-sm">{state.imported} Umsätze importiert, {state.skipped} übersprungen.</div>}
        </form>
      )}
      <form action={mAction} className="card grid gap-3 sm:grid-cols-2">
        <div className="text-sm font-medium sm:col-span-2">{cash ? "Kassenbuchung" : "Umsatz manuell erfassen"}</div>
        <div><label className="label">Datum</label><input className="input" type="date" name="date" defaultValue={new Date().toISOString().slice(0, 10)} /></div>
        <div>
          <label className="label">Richtung</label>
          <select className="input" name="direction"><option value="out">Ausgang</option><option value="in">Eingang</option></select>
        </div>
        <div><label className="label">Betrag</label><input className="input text-right" name="amount" inputMode="decimal" /></div>
        <div><label className="label">Gegenpartei</label><input className="input" name="payeeName" /></div>
        <div className="sm:col-span-2"><label className="label">Verwendungszweck</label><input className="input" name="purpose" /></div>
        <button className="btn sm:col-span-2" disabled={mPending}>Erfassen</button>
        {mState.error && <div className="text-sm text-danger sm:col-span-2">{mState.error}</div>}
      </form>
    </div>
  );
}

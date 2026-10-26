"use client";

import { useActionState, useState, useTransition } from "react";
import type { BankAccount } from "@prisma/client";
import { enshrineVoucher, payVoucher, voucherBackToDraft } from "@/app/actions/vouchers";
import type { ActionResult } from "@/lib/draft";
import { centsToInput } from "@/lib/money";

export function VoucherActions({ id, status, open, enshrined, hasPayments, accounts }: { id: number; status: number; open: number; enshrined: boolean; hasPayments: boolean; accounts: BankAccount[] }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const [payState, payAction, paying] = useActionState<ActionResult, FormData>(payVoucher.bind(null, id), {});
  const call = (fn: () => Promise<ActionResult>, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setError(undefined);
    start(async () => {
      const r = await fn();
      if (r?.error) setError(r.error);
    });
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {!enshrined && !hasPayments && <button className="btn" disabled={pending} onClick={() => call(() => voucherBackToDraft(id))}>Bearbeiten (zurück zu Entwurf)</button>}
        {!enshrined && <button className="btn" disabled={pending} onClick={() => call(() => enshrineVoucher(id), "Festgeschriebene Belege können nicht mehr geändert werden. Fortfahren?")}>Festschreiben</button>}
      </div>
      {error && <div className="text-sm text-danger">{error}</div>}
      {(status === 100 || status === 750) && (
        <form action={payAction} className="card grid gap-3 sm:grid-cols-5 sm:items-end">
          <div><label className="label">Betrag buchen</label><input className="input text-right" name="amount" inputMode="decimal" defaultValue={centsToInput(open)} /></div>
          <div><label className="label">Datum</label><input className="input" type="date" name="date" defaultValue={new Date().toISOString().slice(0, 10)} /></div>
          <div>
            <label className="label">Zahlungskonto</label>
            <select className="input" name="accountId">{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
          </div>
          <div><label className="label">Notiz</label><input className="input" name="note" /></div>
          <button className="btn-primary" disabled={paying}>Bezahlt buchen</button>
          {payState.error && <div className="text-sm text-danger sm:col-span-5">{payState.error}</div>}
          <p className="text-xs text-muted sm:col-span-5">Tipp: Mit Bankumsätzen unter „Bank“ ordnest du Zahlungen automatisch zu.</p>
        </form>
      )}
    </div>
  );
}

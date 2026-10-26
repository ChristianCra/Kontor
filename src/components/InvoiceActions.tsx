"use client";

import { useActionState, useState, useTransition } from "react";
import { addPayment, backToDraft, cancel, creditNote, dunning, enshrine, markSent } from "@/app/actions/invoices";
import type { ActionResult } from "@/lib/draft";
import { centsToInput } from "@/lib/money";

type Props = {
  id: number;
  status: number;
  type: string;
  open: number;
  enshrined: boolean;
  sent: boolean;
  hasPayments: boolean;
  cancelled: boolean;
  overdue: boolean;
  dunningLevel: number;
  eInvoice: boolean;
};

const BILLABLE = ["RE", "AR", "TR", "ER"];

export function InvoiceActions(p: Props) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const [payState, payAction, paying] = useActionState<ActionResult, FormData>(addPayment.bind(null, p.id), {});
  const call = (fn: (id: number) => Promise<ActionResult>, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setError(undefined);
    start(async () => {
      const res = await fn(p.id);
      if (res?.error) setError(res.error);
    });
  };
  const today = new Date().toISOString().slice(0, 10);
  const canPay = (BILLABLE.includes(p.type) || p.type === "GU") && (p.status === 200 || p.status === 750);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <a className="btn-primary" href={`/rechnungen/${p.id}/pdf`} target="_blank">PDF öffnen</a>
        {p.eInvoice && <a className="btn" href={`/rechnungen/${p.id}/xml`}>XRechnung (XML)</a>}
        <a className="btn" href={`/rechnungen/${p.id}/senden`}>Per E-Mail senden</a>
        {!p.sent && <button className="btn" disabled={pending} onClick={() => call(markSent)}>Als versendet markieren</button>}
        {!p.enshrined && <button className="btn" disabled={pending} onClick={() => call(enshrine, "Festgeschriebene Rechnungen können nicht mehr geändert werden. Fortfahren?")}>Festschreiben</button>}
        {!p.enshrined && !p.hasPayments && <button className="btn" disabled={pending} onClick={() => call(backToDraft)}>Zurück zu Entwurf</button>}
        {p.overdue && BILLABLE.includes(p.type) && (
          <button className="btn" disabled={pending} onClick={() => call((id) => dunning(id, p.dunningLevel >= 1 ? 500 : 0))}>
            {p.dunningLevel === 0 ? "Zahlungserinnerung erstellen" : `Mahnung Stufe ${p.dunningLevel + 1} erstellen`}
          </button>
        )}
        {BILLABLE.includes(p.type) && !p.cancelled && <button className="btn" disabled={pending} onClick={() => call(creditNote)}>Gutschrift erstellen</button>}
        {BILLABLE.includes(p.type) && !p.cancelled && !p.hasPayments && <button className="btn-danger" disabled={pending} onClick={() => call(cancel, "Stornorechnung erstellen?")}>Stornieren</button>}
      </div>
      {error && <div className="text-sm text-danger">{error}</div>}
      {canPay && (
        <form action={payAction} className="card grid gap-3 sm:grid-cols-4 sm:items-end">
          <div><label className="label">{p.type === "GU" ? "Erstattung" : "Zahlungseingang"}</label><input className="input text-right" name="amount" inputMode="decimal" defaultValue={centsToInput(p.open)} /></div>
          <div><label className="label">Datum</label><input className="input" type="date" name="date" defaultValue={today} /></div>
          <div><label className="label">Notiz</label><input className="input" name="note" /></div>
          <button className="btn-primary" disabled={paying}>Zahlung buchen</button>
          {payState.error && <div className="text-sm text-danger sm:col-span-4">{payState.error}</div>}
        </form>
      )}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { followUp, invoiceFromOrder, markOrderSent, orderBackToDraft, orderStatus } from "@/app/actions/orders";
import type { ActionResult } from "@/lib/draft";

export function OrderActions({ id, type, status, sent, hasFollowUps }: { id: number; type: string; status: number; sent: boolean; hasFollowUps: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const call = (fn: () => Promise<ActionResult>) => {
    setError(undefined);
    start(async () => {
      const r = await fn();
      if (r?.error) setError(r.error);
    });
  };
  const billable = type !== "LI" && status !== 300 && status !== 1000;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <a className="btn-primary" href={`/angebote/${id}/pdf`} target="_blank">PDF öffnen</a>
        {!sent && <button className="btn" disabled={pending} onClick={() => call(() => markOrderSent(id))}>Als versendet markieren</button>}
        {type === "AN" && status === 200 && (
          <>
            <button className="btn" disabled={pending} onClick={() => call(() => orderStatus(id, 500))}>Angenommen</button>
            <button className="btn" disabled={pending} onClick={() => call(() => orderStatus(id, 300))}>Abgelehnt</button>
          </>
        )}
        {(status === 300 || status === 500) && <button className="btn" disabled={pending} onClick={() => call(() => orderStatus(id, 200))}>Status zurücksetzen</button>}
        {type === "AN" && status !== 300 && <button className="btn" disabled={pending} onClick={() => call(() => followUp(id, "AB"))}>Auftragsbestätigung erstellen</button>}
        {type !== "LI" && status !== 300 && <button className="btn" disabled={pending} onClick={() => call(() => followUp(id, "LI"))}>Lieferschein erstellen</button>}
        {billable && <button className="btn-primary" disabled={pending} onClick={() => call(() => invoiceFromOrder(id))}>Rechnung erstellen</button>}
        {!hasFollowUps && status !== 1000 && <button className="btn" disabled={pending} onClick={() => call(() => orderBackToDraft(id))}>Zurück zu Entwurf</button>}
      </div>
      {error && <div className="text-sm text-danger">{error}</div>}
    </div>
  );
}

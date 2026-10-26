"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Invoice, InvoicePosition, Part, Unit } from "@prisma/client";
import { computeTotals } from "@/lib/calc";
import { centsToInput, formatCents, parseCents } from "@/lib/money";
import { saveAndFinalize, saveDraft, type DraftInput } from "@/app/actions/invoices";

type Row = DraftInput["positions"][number] & { key: number };
type PartWithUnit = Part & { unit: Unit };

const iso = (d: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : "");

function safeCents(s: string): number {
  try {
    return parseCents(s);
  } catch {
    return 0;
  }
}

export function InvoiceEditor({ invoice, parts }: { invoice: Invoice & { positions: InvoicePosition[] }; parts: PartWithUnit[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const [head, setHead] = useState({
    address: invoice.address,
    invoiceDate: iso(invoice.invoiceDate),
    deliveryDate: iso(invoice.deliveryDate),
    deliveryDateUntil: iso(invoice.deliveryDateUntil),
    timeToPay: invoice.timeToPay,
    headText: invoice.headText,
    footText: invoice.footText,
    taxType: invoice.taxType as DraftInput["taxType"],
    discount: invoice.discount,
    customerReference: invoice.customerReference,
  });
  const [rows, setRows] = useState<Row[]>(
    [...invoice.positions]
      .sort((a, b) => a.position - b.position)
      .map((p) => ({
        key: p.id,
        partId: p.partId,
        name: p.name,
        text: p.text,
        quantity: p.quantity,
        unit: p.unit,
        price: centsToInput(p.priceNet),
        discount: p.discount,
        taxRate: p.taxRate,
      })),
  );

  const totals = useMemo(
    () => computeTotals(rows.map((r) => ({ ...r, priceNet: safeCents(r.price) })), head.taxType, head.discount),
    [rows, head.taxType, head.discount],
  );

  const update = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const addRow = (part?: PartWithUnit) =>
    setRows((rs) => [
      ...rs,
      {
        key: Date.now() + Math.random(),
        partId: part?.id ?? null,
        name: part?.name ?? "",
        text: part?.text ?? "",
        quantity: 1,
        unit: part?.unit.name ?? "Stk",
        price: part ? centsToInput(part.priceNet) : "",
        discount: 0,
        taxRate: part?.taxRate ?? 19,
      },
    ]);
  const move = (i: number, dir: -1 | 1) =>
    setRows((rs) => {
      const j = i + dir;
      if (j < 0 || j >= rs.length) return rs;
      const copy = [...rs];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });

  const submit = (finalize: boolean) => {
    setError(undefined);
    const input: DraftInput = { ...head, positions: rows.map(({ key: _key, ...r }) => r) };
    startTransition(async () => {
      const res = await (finalize ? saveAndFinalize(invoice.id, input) : saveDraft(invoice.id, input));
      if (res.error) setError(res.error);
      else router.refresh();
    });
  };

  const field = <K extends keyof typeof head>(k: K) => ({
    value: head[k] as string | number,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setHead((h) => ({ ...h, [k]: typeof h[k] === "number" ? Number(e.target.value) : e.target.value })),
  });

  return (
    <div className="space-y-4">
      <div className="card grid gap-4 md:grid-cols-2">
        <div><label className="label">Empfänger</label><textarea className="input" rows={4} {...field("address")} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Rechnungsdatum</label><input type="date" className="input" {...field("invoiceDate")} /></div>
          <div><label className="label">Zahlungsziel (Tage)</label><input type="number" min={0} className="input" {...field("timeToPay")} /></div>
          <div><label className="label">Leistungsdatum</label><input type="date" className="input" {...field("deliveryDate")} /></div>
          <div><label className="label">Leistung bis (optional)</label><input type="date" className="input" {...field("deliveryDateUntil")} /></div>
          <div><label className="label">Ihre Referenz</label><input className="input" {...field("customerReference")} /></div>
          <div>
            <label className="label">Besteuerung</label>
            <select className="input" {...field("taxType")}>
              <option value="default">Umsatzsteuerpflichtig</option>
              <option value="eu">EU (steuerfrei)</option>
              <option value="noteu">Drittland (steuerfrei)</option>
              <option value="ss">Kleinunternehmer</option>
            </select>
          </div>
        </div>
        <div className="md:col-span-2"><label className="label">Kopftext</label><textarea className="input" rows={3} {...field("headText")} /></div>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="table min-w-[860px]">
          <thead>
            <tr><th className="w-8" /><th>Bezeichnung</th><th className="w-20">Menge</th><th className="w-20">Einheit</th><th className="w-28">Preis netto</th><th className="w-20">Rabatt %</th><th className="w-20">USt. %</th><th className="w-28 text-right">Gesamt</th><th className="w-16" /></tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.key} className="align-top">
                <td className="text-muted">{i + 1}</td>
                <td className="space-y-1">
                  <input className="input" placeholder="Bezeichnung" value={r.name} onChange={(e) => update(r.key, { name: e.target.value })} />
                  <textarea className="input text-xs" rows={1} placeholder="Beschreibung" value={r.text} onChange={(e) => update(r.key, { text: e.target.value })} />
                </td>
                <td><input className="input" type="number" step="any" value={r.quantity} onChange={(e) => update(r.key, { quantity: Number(e.target.value) })} /></td>
                <td><input className="input" value={r.unit} onChange={(e) => update(r.key, { unit: e.target.value })} /></td>
                <td><input className="input text-right" inputMode="decimal" value={r.price} onChange={(e) => update(r.key, { price: e.target.value })} /></td>
                <td><input className="input" type="number" min={0} max={100} value={r.discount} onChange={(e) => update(r.key, { discount: Number(e.target.value) })} /></td>
                <td>
                  <select className="input" value={r.taxRate} onChange={(e) => update(r.key, { taxRate: Number(e.target.value) })}>
                    <option value={19}>19</option><option value={7}>7</option><option value={0}>0</option>
                  </select>
                </td>
                <td className="num pt-3">{formatCents(totals.positions[i] ?? 0)}</td>
                <td className="whitespace-nowrap pt-2 text-muted">
                  <button type="button" aria-label="Nach oben" className="px-1" onClick={() => move(i, -1)}>↑</button>
                  <button type="button" aria-label="Nach unten" className="px-1" onClick={() => move(i, 1)}>↓</button>
                  <button type="button" aria-label="Entfernen" className="px-1 text-danger" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex flex-wrap items-center gap-2 p-3">
          <button type="button" className="btn" onClick={() => addRow()}>+ Freie Position</button>
          {parts.length > 0 && (
            <select className="input max-w-xs" value="" onChange={(e) => { const p = parts.find((x) => x.id === Number(e.target.value)); if (p) addRow(p); }}>
              <option value="">+ Artikel hinzufügen…</option>
              {parts.map((p) => <option key={p.id} value={p.id}>{p.partNumber} · {p.name}</option>)}
            </select>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card space-y-3">
          <div><label className="label">Fußtext</label><textarea className="input" rows={3} {...field("footText")} /></div>
          <div className="max-w-[10rem]"><label className="label">Gesamtrabatt %</label><input type="number" min={0} max={100} className="input" {...field("discount")} /></div>
        </div>
        <div className="card space-y-1 text-sm tabular-nums">
          <div className="flex justify-between"><span>Summe netto</span><span>{formatCents(totals.net)}</span></div>
          {totals.taxGroups.filter((g) => g.rate > 0).map((g) => (
            <div key={g.rate} className="flex justify-between text-muted"><span>USt. {g.rate} % auf {formatCents(g.net)}</span><span>{formatCents(g.tax)}</span></div>
          ))}
          <div className="flex justify-between border-t border-border pt-2 text-base font-semibold"><span>Gesamt</span><span>{formatCents(totals.gross)}</span></div>
        </div>
      </div>

      {error && <div className="rounded-md border border-danger p-3 text-sm text-danger">{error}</div>}
      <div className="flex flex-wrap gap-2">
        <button className="btn" disabled={pending} onClick={() => submit(false)}>Entwurf speichern</button>
        <a className="btn" href={`/rechnungen/${invoice.id}/pdf`} target="_blank">Vorschau (PDF)</a>
        <button className="btn-primary" disabled={pending} onClick={() => submit(true)}>Abschließen und Nummer vergeben</button>
      </div>
    </div>
  );
}

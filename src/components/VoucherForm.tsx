"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AccountingType, Contact, Voucher, VoucherPosition } from "@prisma/client";
import { voucherPositionSums } from "@/lib/calc";
import { centsToInput, formatCents, parseCents } from "@/lib/money";
import { saveAndBookVoucher, saveVoucher, type VoucherInput } from "@/app/actions/vouchers";

type Row = VoucherInput["positions"][number] & { key: number };

const iso = (d: Date | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : "");
const safe = (s: string) => {
  try {
    return parseCents(s);
  } catch {
    return 0;
  }
};

const TAX_TYPES: Record<"D" | "C", [string, string][]> = {
  D: [
    ["default", "Vorsteuerabziehbare Aufwendungen"],
    ["novst", "Nicht vorsteuerabziehbare Aufwendungen"],
    ["igerwerb", "Innergemeinschaftlicher Erwerb"],
    ["rc13b", "Reverse Charge §13b UStG"],
  ],
  C: [
    ["default", "Umsatzsteuerpflichtige Umsätze"],
    ["eu", "Innergemeinschaftliche Lieferung"],
    ["noteu", "Ausfuhr / nicht im Inland steuerbar"],
  ],
};

type Props = {
  voucher?: Voucher & { positions: VoucherPosition[] };
  contacts: Contact[];
  accountingTypes: AccountingType[];
  chart: "skr03" | "skr04";
};

export function VoucherForm({ voucher, contacts, accountingTypes, chart }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const [file, setFile] = useState<File | null>(null);
  const [head, setHead] = useState({
    creditDebit: (voucher?.creditDebit ?? "D") as "C" | "D",
    supplierId: voucher?.supplierId ?? null,
    supplierName: voucher?.supplierName ?? "",
    documentNumber: voucher?.documentNumber ?? "",
    voucherDate: iso(voucher?.voucherDate ?? new Date()),
    deliveryDate: iso(voucher?.deliveryDate),
    dueDate: iso(voucher?.dueDate),
    taxType: (voucher?.taxType ?? "default") as VoucherInput["taxType"],
    net: voucher?.net ?? false,
    supplierIban: voucher?.supplierIban ?? "",
    description: voucher?.description ?? "",
  });
  const typesFor = (cd: "C" | "D") => accountingTypes.filter((a) => (cd === "D" ? ["EXPENSE", "ASSET"] : ["REVENUE"]).includes(a.kind) || a.kind === "PRIVATE");
  const defaultType = (cd: "C" | "D") => typesFor(cd)[0];
  const [rows, setRows] = useState<Row[]>(
    voucher?.positions.length
      ? voucher.positions.map((p) => ({ key: p.id, accountingTypeId: p.accountingTypeId, taxRate: p.taxRate as 0 | 7 | 19, amount: centsToInput(p.amount), comment: p.comment }))
      : [{ key: 1, accountingTypeId: defaultType("D")?.id ?? 0, taxRate: 19, amount: "", comment: "" }],
  );

  const totals = useMemo(() => {
    const sums = rows.map((r) => voucherPositionSums({ amount: safe(r.amount), net: head.net, taxRate: r.taxRate }, head.taxType));
    const byRate = new Map<number, number>();
    rows.forEach((r, i) => byRate.set(r.taxRate, (byRate.get(r.taxRate) ?? 0) + sums[i].tax));
    return {
      net: sums.reduce((s, x) => s + x.net, 0),
      gross: sums.reduce((s, x) => s + x.gross, 0),
      byRate: [...byRate.entries()].filter(([, t]) => t).sort(([a], [b]) => a - b),
    };
  }, [rows, head.net, head.taxType]);

  const setDirection = (cd: "C" | "D") => {
    setHead((h) => ({ ...h, creditDebit: cd, taxType: "default" }));
    const t = defaultType(cd);
    setRows((rs) => rs.map((r) => ({ ...r, accountingTypeId: t?.id ?? 0, taxRate: (t?.defaultTaxRate ?? 19) as 0 | 7 | 19 })));
  };

  const submit = (book: boolean) => {
    setError(undefined);
    const fd = new FormData();
    fd.set("data", JSON.stringify({ ...head, positions: rows.map(({ key: _key, ...r }) => r) }));
    if (file) fd.set("file", file);
    start(async () => {
      const r = await (book ? saveAndBookVoucher : saveVoucher)(voucher?.id ?? null, fd);
      if (r.error) setError(r.error);
      else if (!voucher && r.id) router.push(`/belege/${r.id}`);
      else router.refresh();
    });
  };

  const text = (k: "supplierName" | "documentNumber" | "voucherDate" | "deliveryDate" | "dueDate" | "description" | "supplierIban") => ({
    value: head[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setHead((h) => ({ ...h, [k]: e.target.value })),
  });
  const party = head.creditDebit === "D" ? "Lieferant" : "Kunde";

  return (
    <div className="space-y-4">
      <div className="card space-y-4">
        <div className="flex flex-wrap gap-2">
          <button type="button" className={head.creditDebit === "D" ? "btn-primary" : "btn"} onClick={() => setDirection("D")}>Ausgabe</button>
          <button type="button" className={head.creditDebit === "C" ? "btn-primary" : "btn"} onClick={() => setDirection("C")}>Einnahme</button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="label">{party} aus Kontakten</label>
            <select
              className="input"
              value={head.supplierId ?? ""}
              onChange={(e) => {
                const c = contacts.find((x) => x.id === Number(e.target.value));
                setHead((h) => ({ ...h, supplierId: c?.id ?? null, supplierName: c ? c.name ?? [c.firstName, c.lastName].filter(Boolean).join(" ") : h.supplierName, supplierIban: c?.iban || h.supplierIban }));
              }}
            >
              <option value="">– frei eingeben –</option>
              {contacts.map((c) => <option key={c.id} value={c.id}>{c.name ?? [c.firstName, c.lastName].filter(Boolean).join(" ")}</option>)}
            </select>
          </div>
          <div><label className="label">{party} (Name) *</label><input className="input" {...text("supplierName")} /></div>
          <div><label className="label">Belegnummer</label><input className="input" {...text("documentNumber")} /></div>
          <div><label className="label">Belegdatum *</label><input type="date" className="input" {...text("voucherDate")} /></div>
          <div><label className="label">Leistungsdatum</label><input type="date" className="input" {...text("deliveryDate")} /></div>
          <div><label className="label">Fällig am</label><input type="date" className="input" {...text("dueDate")} /></div>
          <div className="sm:col-span-2">
            <label className="label">Steuerregel</label>
            <select className="input" value={head.taxType} onChange={(e) => setHead((h) => ({ ...h, taxType: e.target.value as VoucherInput["taxType"] }))}>
              {TAX_TYPES[head.creditDebit].map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
          <div><label className="label">IBAN {party}</label><input className="input" {...text("supplierIban")} /></div>
        </div>
        <div><label className="label">Beschreibung</label><input className="input" {...text("description")} /></div>
        <div>
          <label className="label">Belegdatei (PDF oder Bild)</label>
          <input type="file" accept="application/pdf,image/*" className="text-sm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          {voucher?.fileName && !file && <p className="mt-1 text-xs text-muted">Aktuell: {voucher.fileName}</p>}
        </div>
      </div>

      <div className="card overflow-x-auto p-0">
        <div className="flex items-center justify-between px-4 pt-3 text-sm">
          <span className="font-medium">Positionen</span>
          <label className="flex items-center gap-2"><input type="checkbox" checked={head.net} onChange={(e) => setHead((h) => ({ ...h, net: e.target.checked }))} /> Beträge netto erfassen</label>
        </div>
        <table className="table min-w-[720px]">
          <thead><tr><th>Buchungskonto</th><th className="w-32">Betrag {head.net ? "netto" : "brutto"}</th><th className="w-24">USt. %</th><th>Notiz</th><th className="w-10" /></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td>
                  <select
                    className="input"
                    value={r.accountingTypeId}
                    onChange={(e) => {
                      const t = accountingTypes.find((a) => a.id === Number(e.target.value));
                      setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, accountingTypeId: Number(e.target.value), taxRate: (t?.defaultTaxRate ?? x.taxRate) as 0 | 7 | 19 } : x)));
                    }}
                  >
                    {typesFor(head.creditDebit).map((a) => <option key={a.id} value={a.id}>{a[chart]} · {a.name}</option>)}
                  </select>
                </td>
                <td><input className="input text-right" inputMode="decimal" value={r.amount} onChange={(e) => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, amount: e.target.value } : x)))} /></td>
                <td>
                  <select className="input" value={r.taxRate} onChange={(e) => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, taxRate: Number(e.target.value) as 0 | 7 | 19 } : x)))}>
                    <option value={19}>19</option><option value={7}>7</option><option value={0}>0</option>
                  </select>
                </td>
                <td><input className="input" value={r.comment} onChange={(e) => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, comment: e.target.value } : x)))} /></td>
                <td><button type="button" aria-label="Entfernen" className="text-danger" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex flex-wrap items-start justify-between gap-4 p-3">
          <button type="button" className="btn" onClick={() => { const t = defaultType(head.creditDebit); setRows((rs) => [...rs, { key: Date.now(), accountingTypeId: t?.id ?? 0, taxRate: (t?.defaultTaxRate ?? 19) as 0 | 7 | 19, amount: "", comment: "" }]); }}>+ Position</button>
          <div className="min-w-[16rem] space-y-1 text-sm tabular-nums">
            <div className="flex justify-between"><span>Netto</span><span>{formatCents(totals.net)}</span></div>
            {totals.byRate.map(([rate, tax]) => <div key={rate} className="flex justify-between text-muted"><span>{head.creditDebit === "D" ? "Vorsteuer" : "USt."} {rate} %</span><span>{formatCents(tax)}</span></div>)}
            <div className="flex justify-between border-t border-border pt-1 font-semibold"><span>Brutto</span><span>{formatCents(totals.gross)}</span></div>
          </div>
        </div>
      </div>

      {error && <div className="rounded-md border border-danger p-3 text-sm text-danger">{error}</div>}
      <div className="flex flex-wrap gap-2">
        <button className="btn" disabled={pending} onClick={() => submit(false)}>Als Entwurf speichern</button>
        <button className="btn-primary" disabled={pending} onClick={() => submit(true)}>Speichern und buchen</button>
      </div>
    </div>
  );
}

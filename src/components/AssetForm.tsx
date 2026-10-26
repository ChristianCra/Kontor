import { ASSET_METHODS } from "@/lib/afa";
import { centsToInput } from "@/lib/money";

type Asset = {
  name: string; inventoryNumber: string; accountingTypeId: number; method: string; acquisitionDate: Date; cost: number;
  usefulLifeYears: number; disposalDate: Date | null; disposalProceeds: number; note: string; voucherId: number | null;
};

const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");

export function AssetForm({ action, asset, accounts }: { action: (fd: FormData) => Promise<void>; asset?: Asset; accounts: { id: number; name: string; number: string }[] }) {
  const fromVoucher = !!asset?.voucherId;
  return (
    <form action={action} className="card grid max-w-3xl gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2"><label className="label">Bezeichnung *</label><input className="input" name="name" required defaultValue={asset?.name} /></div>
      <div><label className="label">Inventarnummer</label><input className="input" name="inventoryNumber" defaultValue={asset?.inventoryNumber} /></div>
      <div>
        <label className="label">Anlagekonto</label>
        <select className="input" name="accountingTypeId" defaultValue={asset?.accountingTypeId}>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.number} · {a.name}</option>)}
        </select>
      </div>
      <div>
        <label className="label">Anschaffungsdatum *</label>
        <input className="input" type="date" name="acquisitionDate" required defaultValue={iso(asset?.acquisitionDate)} readOnly={fromVoucher} />
      </div>
      <div>
        <label className="label">Anschaffungskosten netto (€) *</label>
        <input className="input" name="cost" required inputMode="decimal" defaultValue={asset ? centsToInput(asset.cost) : ""} readOnly={fromVoucher} />
      </div>
      <div>
        <label className="label">Abschreibung</label>
        <select className="input" name="method" defaultValue={asset?.method ?? "linear"}>
          {Object.entries(ASSET_METHODS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>
      <div>
        <label className="label">Nutzungsdauer (Jahre, nur linear)</label>
        <input className="input" type="number" min={1} max={50} name="usefulLifeYears" defaultValue={asset?.usefulLifeYears ?? 5} />
      </div>
      <div><label className="label">Abgang am (Verkauf oder Entnahme)</label><input className="input" type="date" name="disposalDate" defaultValue={iso(asset?.disposalDate)} /></div>
      <div><label className="label">Erlös netto (€, Verkauf bitte als Rechnung schreiben)</label><input className="input" name="disposalProceeds" inputMode="decimal" defaultValue={asset?.disposalProceeds ? centsToInput(asset.disposalProceeds) : ""} /></div>
      <div className="sm:col-span-2"><label className="label">Notiz</label><textarea className="input" name="note" rows={2} defaultValue={asset?.note} /></div>
      {fromVoucher && <p className="text-xs text-muted sm:col-span-2">Datum und Kosten stammen aus dem Beleg und lassen sich nur dort ändern.</p>}
      <div className="sm:col-span-2"><button className="btn-primary">Speichern</button></div>
    </form>
  );
}

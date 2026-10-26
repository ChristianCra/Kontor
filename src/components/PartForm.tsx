import type { Part, Unit } from "@prisma/client";
import { centsToInput } from "@/lib/money";

export function PartForm({ action, part, units }: { action: (fd: FormData) => Promise<void>; part?: Part & { unit: Unit }; units: Unit[] }) {
  return (
    <form action={action} className="card max-w-2xl space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div><label className="label">Artikelnummer *</label><input className="input" name="partNumber" required defaultValue={part?.partNumber} /></div>
        <div className="sm:col-span-2"><label className="label">Bezeichnung *</label><input className="input" name="name" required defaultValue={part?.name} /></div>
      </div>
      <div><label className="label">Beschreibung</label><textarea className="input" rows={3} name="text" defaultValue={part?.text} /></div>
      <div className="grid gap-4 sm:grid-cols-4">
        <div>
          <label className="label">Einheit</label>
          <input className="input" name="unit" list="units" defaultValue={part?.unit.name ?? "Stk"} />
          <datalist id="units">{units.map((u) => <option key={u.id} value={u.name} />)}</datalist>
        </div>
        <div><label className="label">Verkaufspreis netto</label><input className="input" name="priceNet" inputMode="decimal" defaultValue={part ? centsToInput(part.priceNet) : ""} /></div>
        <div><label className="label">Einkaufspreis netto</label><input className="input" name="pricePurchase" inputMode="decimal" defaultValue={part ? centsToInput(part.pricePurchase) : ""} /></div>
        <div>
          <label className="label">Steuersatz</label>
          <select className="input" name="taxRate" defaultValue={part?.taxRate ?? 19}>
            <option value={19}>19 %</option><option value={7}>7 %</option><option value={0}>0 %</option>
          </select>
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={part?.active ?? true} /> Aktiv</label>
      <button className="btn-primary">Speichern</button>
    </form>
  );
}

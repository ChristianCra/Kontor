import { db } from "@/lib/db";
import { saveSettings } from "@/app/actions/settings";
import { formatNumber } from "@/lib/sequence";

export const dynamic = "force-dynamic";

const FIELDS: [string, string][] = [
  ["name", "Firmenname *"], ["street", "Straße"], ["zip", "PLZ"], ["city", "Ort"], ["country", "Land"],
  ["email", "E-Mail"], ["phone", "Telefon"], ["taxNumber", "Steuernummer"], ["vatId", "USt-IdNr."],
  ["bankName", "Bank"], ["iban", "IBAN"], ["bic", "BIC"],
];

export default async function Settings() {
  const [company, seqs] = await Promise.all([db.company.findUnique({ where: { id: 1 } }), db.numberSequence.findMany()]);
  const fmt = (type: string, fallback: string) => seqs.find((s) => s.type === type)?.format ?? fallback;
  const invoiceFormat = fmt("INVOICE", "RE-{YYYY}-{NNNN}");
  const next = seqs.find((s) => s.type === "INVOICE")?.next ?? 1;
  return (
    <div className="space-y-4">
      <h1 className="h1">Einstellungen</h1>
      <form action={saveSettings} className="card max-w-3xl space-y-5">
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-2 text-sm font-medium">Firmendaten (erscheinen auf allen Belegen)</legend>
          {FIELDS.map(([k, l]) => (
            <div key={k}>
              <label className="label">{l}</label>
              <input className="input" name={k} required={k === "name"} defaultValue={(company?.[k as keyof typeof company] as string) ?? (k === "country" ? "DE" : "")} />
            </div>
          ))}
          <div><label className="label">Standard-Zahlungsziel (Tage)</label><input className="input" type="number" name="defaultTimeToPay" defaultValue={company?.defaultTimeToPay ?? 14} /></div>
          <label className="flex items-center gap-2 self-end text-sm"><input type="checkbox" name="smallBusiness" defaultChecked={company?.smallBusiness} /> Kleinunternehmer (§19 UStG)</label>
        </fieldset>
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-2 text-sm font-medium">Nummernkreise</legend>
          <div>
            <label className="label">Rechnungen</label>
            <input className="input" name="invoiceFormat" defaultValue={invoiceFormat} />
            <p className="mt-1 text-xs text-muted">Nächste Nummer: {formatNumber(invoiceFormat, next)}. Platzhalter: {"{YYYY}"} Jahr, {"{NNNN}"} laufende Nummer.</p>
          </div>
          <div><label className="label">Kundennummern</label><input className="input" name="customerFormat" defaultValue={fmt("CUSTOMER", "{NNNN}")} /></div>
        </fieldset>
        <button className="btn-primary">Speichern</button>
      </form>
    </div>
  );
}

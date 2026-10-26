import Link from "next/link";
import { getCompany } from "@/lib/company";
import { loadJournal } from "@/lib/journal-data";
import { periodFor } from "@/lib/journal";
import { computeUstva, elsterValue, fullEuros } from "@/lib/ustva";
import { formatCents, formatDate } from "@/lib/money";
import { PeriodPicker, parsePeriodParams, periodLabel } from "@/components/PeriodPicker";
import { CopyValue } from "@/components/CopyValue";

export const dynamic = "force-dynamic";

export default async function Ustva({ searchParams }: { searchParams: Promise<{ jahr?: string; art?: string; nr?: string }> }) {
  const company = await getCompany();
  const { year, kind, index } = parsePeriodParams(await searchParams, company.vatPeriod as "MONTH" | "QUARTER" | "YEAR");
  const period = periodFor(kind, year, index);
  const report = computeUstva(await loadJournal(company.chartOfAccounts as "skr03" | "skr04"), period, company.cashAccounting);
  const due = new Date(period.to.getFullYear(), period.to.getMonth(), 10);
  const docHref = (d: { source: string; id: number }) => (d.source === "invoice" ? `/rechnungen/${d.id}` : `/belege/${d.id}`);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="h1">Umsatzsteuer-Voranmeldung</h1>
        <p className="text-sm text-muted">
          {periodLabel(kind, year, index)} · {company.cashAccounting ? "Ist-Versteuerung (nach Zahlungseingang)" : "Soll-Versteuerung (nach Rechnungsdatum)"} · fällig am {formatDate(due)}
        </p>
      </div>
      <PeriodPicker base="/steuern/ustva" year={year} kind={kind} index={index} />
      {company.smallBusiness && <div className="card text-sm">Als Kleinunternehmer (§19 UStG) gibst du in der Regel keine Umsatzsteuer-Voranmeldung ab.</div>}
      {report.unassigned.length > 0 && (
        <div className="rounded-md border border-amber-500 p-3 text-sm">
          Nicht zugeordnet: {report.unassigned.map((u) => `${u.label} (${u.reason})`).join("; ")}
        </div>
      )}
      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead><tr><th>Kz.</th><th>Bezeichnung</th><th className="num">Bemessungsgrundlage</th><th className="num">Steuer</th><th>Belege</th></tr></thead>
          <tbody>
            {report.fields.map((f) => (
              <tr key={f.key}>
                <td className="tabular-nums">{[f.baseCode, f.taxCode].filter(Boolean).join(" / ")}</td>
                <td>{f.label}</td>
                <td className="num">{f.baseCode ? <>{fullEuros(f.base).toLocaleString("de-DE")} € <CopyValue value={elsterValue(f.base, true)} /></> : ""}</td>
                <td className="num">{formatCents(f.tax)} {f.taxCode && <CopyValue value={elsterValue(f.tax)} />}</td>
                <td className="text-xs">
                  {f.docs.slice(0, 5).map((d, i) => <span key={`${d.source}${d.id}`}>{i > 0 && ", "}<Link className="text-accent hover:underline" href={docHref(d)}>{d.label}</Link></span>)}
                  {f.docs.length > 5 && ` +${f.docs.length - 5}`}
                </td>
              </tr>
            ))}
            {report.fields.length === 0 && <tr><td colSpan={5} className="text-muted">Keine Umsätze im Zeitraum.</td></tr>}
          </tbody>
          <tfoot>
            <tr><td /><td>Umsatzsteuer</td><td /><td className="num">{formatCents(report.ust)}</td><td /></tr>
            <tr><td /><td>Abziehbare Vorsteuer</td><td /><td className="num">−{formatCents(report.vst)}</td><td /></tr>
            <tr className="font-semibold">
              <td>83</td>
              <td>{report.payable >= 0 ? "Verbleibende Zahllast" : "Erstattung"}</td>
              <td />
              <td className="num">{formatCents(report.payable)} <CopyValue value={elsterValue(report.payable)} /></td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-xs text-muted">
        Bemessungsgrundlagen in vollen Euro wie im ELSTER-Formular. Für Kz. 81 und 86 wird die Steuer aus der Bemessungsgrundlage berechnet. Die Übermittlung erfolgt aktuell über „Mein ELSTER“; „kopieren“ liefert die Werte im passenden Format.
      </p>
    </div>
  );
}

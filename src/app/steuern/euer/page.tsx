import Link from "next/link";
import { getCompany } from "@/lib/company";
import { loadJournal } from "@/lib/journal-data";
import { periodFor } from "@/lib/journal";
import { computeEuer, type EuerLine } from "@/lib/euer";
import { loadAfa } from "@/lib/assets";
import { formatCents } from "@/lib/money";
import { elsterValue } from "@/lib/ustva";
import { PeriodPicker, parsePeriodParams, periodLabel } from "@/components/PeriodPicker";
import { CopyValue } from "@/components/CopyValue";

export const dynamic = "force-dynamic";

function Lines({ lines, showAccounts }: { lines: EuerLine[]; showAccounts: boolean }) {
  return (
    <>
      {lines.filter((l) => l.amount).map((l) => (
        <tbody key={l.key}>
          <tr>
            <td className="w-16 text-xs text-muted tabular-nums">{l.row ? `Z. ${l.row}` : ""}{l.kz && <div>Kz {l.kz}</div>}</td>
            <td>{l.label}{l.note && <span className="text-xs text-muted"> ({l.note})</span>}</td>
            <td className="num">{formatCents(l.amount)} <CopyValue value={elsterValue(l.amount)} /></td>
          </tr>
          {showAccounts && [...l.accounts.entries()].map(([nr, a]) => (
            <tr key={nr} className="text-xs text-muted"><td /><td className="pl-4">{nr} · {a.name}</td><td className="num">{formatCents(a.amount)}</td></tr>
          ))}
        </tbody>
      ))}
    </>
  );
}

export default async function Euer({ searchParams }: { searchParams: Promise<{ jahr?: string; art?: string; nr?: string; konten?: string }> }) {
  const sp = await searchParams;
  const company = await getCompany();
  const { year, kind, index } = parsePeriodParams(sp, "YEAR");
  const chart = company.chartOfAccounts as "skr03" | "skr04";
  const afa = await loadAfa(chart);
  const report = computeEuer(await loadJournal(chart), periodFor(kind, year, index), afa.items);
  report.warnings.push(...afa.warnings);
  const showAccounts = sp.konten === "1";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="h1">Einnahmen-Überschuss-Rechnung</h1>
          <p className="text-sm text-muted">{periodLabel(kind, year, index)} · nach Zahlungsdatum (Zuflussprinzip)</p>
        </div>
        <a className="btn" href={`/steuern/euer?jahr=${year}&art=${kind}&nr=${index}&konten=${showAccounts ? 0 : 1}`}>{showAccounts ? "Konten ausblenden" : "Konten anzeigen"}</a>
      </div>
      <PeriodPicker base="/steuern/euer" year={year} kind={kind} index={index} />
      {report.warnings.length > 0 && (
        <div className="rounded-md border border-amber-500 p-3 text-sm">{report.warnings.map((w) => `${w.label}: ${w.reason}`).join("; ")}</div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead><tr><th>Zeile</th><th>Betriebseinnahmen</th><th className="num">Betrag</th></tr></thead>
            <Lines lines={report.income} showAccounts={showAccounts} />
            <tfoot><tr className="font-semibold"><td className="text-xs">Z. 23</td><td>Summe Betriebseinnahmen</td><td className="num">{formatCents(report.totalIncome)}</td></tr></tfoot>
          </table>
        </div>
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead><tr><th>Zeile</th><th>Betriebsausgaben</th><th className="num">Betrag</th></tr></thead>
            <Lines lines={report.expenses} showAccounts={showAccounts} />
            <tfoot><tr className="font-semibold"><td className="text-xs">Z. 75</td><td>Summe Betriebsausgaben</td><td className="num">{formatCents(report.totalExpenses)}</td></tr></tfoot>
          </table>
          {report.nonDeductible.some((l) => l.amount) && (
            <table className="table">
              <thead><tr><th>Zeile</th><th>Nicht abziehbare Betriebsausgaben</th><th /></tr></thead>
              <Lines lines={report.nonDeductible} showAccounts={showAccounts} />
            </table>
          )}
        </div>
      </div>
      <div className="card flex items-center justify-between text-lg font-semibold">
        <span>{report.profit >= 0 ? "Gewinn" : "Verlust"}</span>
        <span className={`tabular-nums ${report.profit < 0 ? "text-danger" : ""}`}>{formatCents(report.profit)}</span>
      </div>
      <p className="text-xs text-muted">Zeilen und Kennzahlen nach dem Vordruck der Anlage EÜR {report.formYear}{year !== report.formYear && ` (für ${year} bitte mit dem aktuellen Vordruck abgleichen, die Zeilennummern ändern sich gelegentlich)`}. Abschreibungen kommen aus dem <Link className="underline" href="/anlagen">Anlagenverzeichnis</Link>. Die Auswertung ersetzt keine Steuerberatung.</p>
    </div>
  );
}

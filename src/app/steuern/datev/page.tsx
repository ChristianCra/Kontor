import Link from "next/link";
import { db } from "@/lib/db";
import { getCompany } from "@/lib/company";
import { loadDatevInput } from "@/lib/datev-data";
import { validatePeriod } from "@/lib/datev";
import { formatDate } from "@/lib/money";

export const dynamic = "force-dynamic";

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default async function Datev({ searchParams }: { searchParams: Promise<{ von?: string; bis?: string }> }) {
  const sp = await searchParams;
  const now = new Date();
  // Voreinstellung: Vormonat
  const from = sp.von ? new Date(sp.von) : new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const toIncl = sp.bis ? new Date(sp.bis) : new Date(now.getFullYear(), now.getMonth(), 0);
  from.setHours(0, 0, 0, 0);
  toIncl.setHours(0, 0, 0, 0);
  const period = { from, to: new Date(toIncl.getFullYear(), toIncl.getMonth(), toIncl.getDate() + 1) };
  const [company, input, history] = await Promise.all([getCompany(), loadDatevInput(period), db.datevExport.findMany({ orderBy: { createdAt: "desc" }, take: 10 })]);
  const error = validatePeriod(period, input.settings.fiscalYearStart);
  return (
    <div className="space-y-4">
      <h1 className="h1">DATEV-Export</h1>
      <p className="text-sm text-muted">Buchungsstapel im DATEV-Format (EXTF 700) für deine Steuerkanzlei. Kontenrahmen {company.chartOfAccounts.toUpperCase()}, Beraternummer {company.datevAdvisor || "–"}, Mandantennummer {company.datevClient || "–"}. <Link className="text-accent hover:underline" href="/einstellungen">Einstellungen</Link></p>
      <form className="card flex flex-wrap items-end gap-3">
        <div><label className="label">Von</label><input className="input" type="date" name="von" defaultValue={iso(from)} /></div>
        <div><label className="label">Bis</label><input className="input" type="date" name="bis" defaultValue={iso(toIncl)} /></div>
        <button className="btn">Prüfen</button>
      </form>
      <div className="card space-y-3 text-sm">
        <div className="font-medium">Prüfergebnis</div>
        {error && <div className="text-danger">{error}</div>}
        <div>{input.docCount} Dokumente im Zeitraum, davon {input.openCount} noch nicht festgeschrieben; {input.transactions.length} Zahlungen.</div>
        {input.problems.map((p) => <div key={p} className="text-amber-700 dark:text-amber-300">⚠ {p}</div>)}
        {!error && (
          <form action="/steuern/datev/export" method="post" className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="from" value={iso(from)} />
            <input type="hidden" name="to" value={iso(toIncl)} />
            <label className="flex items-center gap-2"><input type="checkbox" name="enshrine" /> Exportierte Dokumente festschreiben</label>
            <button className="btn-primary">Buchungsstapel herunterladen</button>
          </form>
        )}
      </div>
      {history.length > 0 && (
        <div className="card overflow-x-auto p-0">
          <div className="px-5 pt-4 text-sm font-medium">Bisherige Exporte</div>
          <table className="table mt-2">
            <thead><tr><th>Zeitraum</th><th className="num">Buchungen</th><th>Festgeschrieben</th><th>Erstellt</th></tr></thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id}><td>{formatDate(h.from)} – {formatDate(new Date(h.to.getTime() - 1))}</td><td className="num">{h.lines}</td><td>{h.enshrined ? "ja" : "nein"}</td><td>{formatDate(h.createdAt)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

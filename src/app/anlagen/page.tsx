import Link from "next/link";
import { loadAssets } from "@/lib/assets";
import { getCompany } from "@/lib/company";
import { ASSET_METHODS, afaInPeriod, bookValue, methodWarning } from "@/lib/afa";
import { periodFor } from "@/lib/journal";
import { formatCents, formatDate } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function Assets({ searchParams }: { searchParams: Promise<{ jahr?: string }> }) {
  const sp = await searchParams;
  const year = Number(sp.jahr) || new Date().getFullYear();
  const [assets, company] = await Promise.all([loadAssets(), getCompany()]);
  const chart = company.chartOfAccounts as "skr03" | "skr04";
  const p = periodFor("YEAR", year, 1);
  const rows = assets
    .filter((a) => a.acquisitionDate < p.to && (!a.disposalDate || a.disposalDate >= p.from || a.method === "pool"))
    .map((a) => {
      const items = afaInPeriod(a, p);
      return {
        a,
        start: bookValue(a, p.from),
        afa: items.filter((i) => i.kind !== "residual" && i.kind !== "proceeds").reduce((s, i) => s + i.amount, 0),
        residual: items.filter((i) => i.kind === "residual").reduce((s, i) => s + i.amount, 0),
        end: bookValue(a, p.to),
        added: a.acquisitionDate >= p.from ? a.cost : 0,
      };
    });
  const sum = (k: "start" | "afa" | "residual" | "end" | "added") => rows.reduce((s, r) => s + r[k], 0);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="h1">Anlagenverzeichnis {year}</h1>
          <p className="text-sm text-muted">Anlagegüter aus Belegen mit Anlagekonto werden automatisch übernommen.</p>
        </div>
        <div className="flex gap-2">
          <Link className="btn" href={`/anlagen?jahr=${year - 1}`}>← {year - 1}</Link>
          <Link className="btn" href={`/anlagen?jahr=${year + 1}`}>{year + 1} →</Link>
          <Link className="btn-primary" href="/anlagen/neu">Anlagegut erfassen</Link>
        </div>
      </div>
      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr><th>Anlagegut</th><th>Konto</th><th>Anschaffung</th><th>Abschreibung</th><th className="num">AK</th><th className="num">Buchwert 1.1.</th><th className="num">Zugang</th><th className="num">AfA</th><th className="num">Abgang</th><th className="num">Buchwert 31.12.</th></tr>
          </thead>
          <tbody>
            {rows.map(({ a, start, afa, residual, end, added }) => (
              <tr key={a.id}>
                <td>
                  <Link className="text-accent hover:underline" href={`/anlagen/${a.id}`}>{a.name}</Link>
                  {a.inventoryNumber && <span className="text-xs text-muted"> · {a.inventoryNumber}</span>}
                  {methodWarning(a) && <div className="text-xs text-danger">{methodWarning(a)}</div>}
                </td>
                <td className="text-xs">{a.accountingType[chart]}</td>
                <td>{formatDate(a.acquisitionDate)}</td>
                <td className="text-xs">{ASSET_METHODS[a.method as keyof typeof ASSET_METHODS]}{a.method === "linear" && `, ${a.usefulLifeYears} J.`}</td>
                <td className="num">{formatCents(a.cost)}</td>
                <td className="num">{formatCents(start)}</td>
                <td className="num">{added ? formatCents(added) : ""}</td>
                <td className="num">{formatCents(afa)}</td>
                <td className="num">{residual ? formatCents(residual) : ""}</td>
                <td className="num">{formatCents(end)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={10} className="text-muted">Keine Anlagegüter in diesem Jahr.</td></tr>}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="font-semibold"><td colSpan={5}>Summe</td><td className="num">{formatCents(sum("start"))}</td><td className="num">{formatCents(sum("added"))}</td><td className="num">{formatCents(sum("afa"))}</td><td className="num">{formatCents(sum("residual"))}</td><td className="num">{formatCents(sum("end"))}</td></tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className="text-xs text-muted">Lineare AfA monatsgenau ab dem Anschaffungsmonat, digitale Wirtschaftsgüter mit einem Jahr Nutzungsdauer, GWG bis 800 € netto sofort, Sammelposten (250,01 € bis 1.000 €) über fünf Jahre.</p>
    </div>
  );
}

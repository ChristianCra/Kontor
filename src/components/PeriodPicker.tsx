import Link from "next/link";

const QUARTERS = ["Q1", "Q2", "Q3", "Q4"];
const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

// Auswahl von Jahr und Zeitraum über Links, damit der Bericht per URL teilbar bleibt
export function PeriodPicker({ base, year, kind, index }: { base: string; year: number; kind: string; index: number }) {
  const href = (y: number, k: string, i: number) => `${base}?jahr=${y}&art=${k}&nr=${i}`;
  const cls = (active: boolean) => (active ? "btn-primary" : "btn");
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1">
        <Link className="btn" href={href(year - 1, kind, index)}>←</Link>
        <span className="px-2 font-medium tabular-nums">{year}</span>
        <Link className="btn" href={href(year + 1, kind, index)}>→</Link>
        <span className="mx-2 text-muted">|</span>
        <Link className={cls(kind === "YEAR")} href={href(year, "YEAR", 1)}>Jahr</Link>
        {QUARTERS.map((q, i) => <Link key={q} className={cls(kind === "QUARTER" && index === i + 1)} href={href(year, "QUARTER", i + 1)}>{q}</Link>)}
      </div>
      <div className="flex flex-wrap gap-1">
        {MONTHS.map((m, i) => <Link key={m} className={`${cls(kind === "MONTH" && index === i + 1)} text-xs`} href={href(year, "MONTH", i + 1)}>{m}</Link>)}
      </div>
    </div>
  );
}

export function parsePeriodParams(sp: { jahr?: string; art?: string; nr?: string }, defaultKind: "MONTH" | "QUARTER" | "YEAR") {
  const now = new Date();
  const year = Number(sp.jahr) || now.getFullYear();
  const kind = (["MONTH", "QUARTER", "YEAR"].includes(sp.art ?? "") ? sp.art : defaultKind) as "MONTH" | "QUARTER" | "YEAR";
  const fallback = kind === "QUARTER" ? Math.floor(now.getMonth() / 3) + 1 : kind === "MONTH" ? now.getMonth() + 1 : 1;
  const index = Number(sp.nr) || fallback;
  return { year, kind, index };
}

export function periodLabel(kind: string, year: number, index: number) {
  if (kind === "YEAR") return String(year);
  if (kind === "QUARTER") return `${index}. Quartal ${year}`;
  return `${MONTHS[index - 1]} ${year}`;
}

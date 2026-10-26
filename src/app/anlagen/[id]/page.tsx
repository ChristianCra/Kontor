import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCompany } from "@/lib/company";
import { afaSchedule, methodWarning } from "@/lib/afa";
import { deleteAsset, updateAsset } from "@/app/actions/assets";
import { AssetForm } from "@/components/AssetForm";
import { formatCents } from "@/lib/money";

export const dynamic = "force-dynamic";

const KIND: Record<string, string> = { afa: "AfA", gwg: "GWG", pool: "Sammelposten", residual: "Restbuchwert (Abgang)", proceeds: "Erlös (Abgang)" };

export default async function AssetDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ fehler?: string; gespeichert?: string }> }) {
  const { id } = await params;
  const { fehler, gespeichert } = await searchParams;
  const asset = await db.asset.findUnique({ where: { id: Number(id) }, include: { voucher: true } });
  if (!asset) notFound();
  const [types, company] = await Promise.all([db.accountingType.findMany({ where: { kind: "ASSET" } }), getCompany()]);
  const chart = company.chartOfAccounts as "skr03" | "skr04";
  // Jahresübersicht der Abschreibung
  const byYear = new Map<number, { afa: number; other: string[] }>();
  for (const i of afaSchedule(asset)) {
    const y = i.date.getFullYear();
    const row = byYear.get(y) ?? { afa: 0, other: [] };
    if (i.kind === "residual" || i.kind === "proceeds") row.other.push(`${KIND[i.kind]} ${formatCents(i.amount)}`);
    else row.afa += i.amount;
    byYear.set(y, row);
  }
  let remaining = asset.cost;
  const warning = methodWarning(asset);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="h1">{asset.name}</h1>
        <Link className="btn" href="/anlagen">Zum Anlagenverzeichnis</Link>
      </div>
      {fehler && <div className="rounded-md border border-danger p-3 text-sm text-danger">{fehler}</div>}
      {gespeichert && <div className="rounded-md border border-border p-3 text-sm">Gespeichert.</div>}
      {warning && <div className="rounded-md border border-amber-500 p-3 text-sm">{warning}</div>}
      {asset.voucher && <p className="text-sm">Aus Beleg <Link className="text-accent hover:underline" href={`/belege/${asset.voucher.id}`}>{asset.voucher.documentNumber || asset.voucher.supplierName}</Link></p>}
      <AssetForm action={updateAsset.bind(null, asset.id)} asset={asset} accounts={types.map((t) => ({ id: t.id, name: t.name, number: t[chart] }))} />
      <div className="card max-w-3xl overflow-x-auto p-0">
        <table className="table">
          <thead><tr><th>Jahr</th><th className="num">Abschreibung</th><th className="num">Buchwert Jahresende</th><th>Abgang</th></tr></thead>
          <tbody>
            {[...byYear.entries()].map(([y, r]) => {
              remaining -= r.afa;
              return <tr key={y}><td>{y}</td><td className="num">{formatCents(r.afa)}</td><td className="num">{formatCents(asset.disposalDate && asset.disposalDate.getFullYear() <= y ? 0 : remaining)}</td><td className="text-xs">{r.other.join(", ")}</td></tr>;
            })}
          </tbody>
        </table>
      </div>
      {!asset.voucherId && (
        <form action={deleteAsset.bind(null, asset.id)}><button className="btn text-danger">Anlagegut löschen</button></form>
      )}
    </div>
  );
}

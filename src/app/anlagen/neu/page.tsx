import { db } from "@/lib/db";
import { getCompany } from "@/lib/company";
import { ensureAccountingTypes } from "@/lib/accounts";
import { createAsset } from "@/app/actions/assets";
import { AssetForm } from "@/components/AssetForm";

export const dynamic = "force-dynamic";

export default async function NewAsset({ searchParams }: { searchParams: Promise<{ fehler?: string }> }) {
  const { fehler } = await searchParams;
  await ensureAccountingTypes();
  const [types, company] = await Promise.all([db.accountingType.findMany({ where: { kind: "ASSET", active: true } }), getCompany()]);
  const chart = company.chartOfAccounts as "skr03" | "skr04";
  return (
    <div className="space-y-4">
      <h1 className="h1">Anlagegut erfassen</h1>
      {fehler && <div className="rounded-md border border-danger p-3 text-sm text-danger">{fehler}</div>}
      <AssetForm action={createAsset} accounts={types.map((t) => ({ id: t.id, name: t.name, number: t[chart] }))} />
    </div>
  );
}

import { db } from "./db";
import { ensureAccountingTypes } from "./accounts";
import { afaSchedule, defaultsForAccount, methodWarning } from "./afa";
import type { AssetAfa } from "./euer";

// Legt für gebuchte Ausgabenbelege mit Anlage-Konten fehlende Anlagegüter an.
// Idempotent über voucherPositionId; damit werden auch ältere Belege nachgetragen.
export async function syncAssetsFromVouchers() {
  const positions = await db.voucherPosition.findMany({
    where: { accountingType: { kind: "ASSET" }, voucher: { status: { not: 50 }, creditDebit: "D" } },
    include: { voucher: { include: { assets: { select: { voucherPositionId: true } } } }, accountingType: true },
  });
  for (const p of positions) {
    if (p.voucher.assets.some((a) => a.voucherPositionId === p.id)) continue;
    const { method, years } = defaultsForAccount(p.accountingType.skr03);
    await db.asset.create({
      data: {
        name: p.comment || p.voucher.description || `${p.accountingType.name} ${p.voucher.supplierName}`.trim(),
        accountingTypeId: p.accountingTypeId,
        method,
        usefulLifeYears: years,
        acquisitionDate: p.voucher.deliveryDate ?? p.voucher.voucherDate,
        // Ohne Vorsteuerabzug gehört die Umsatzsteuer zu den Anschaffungskosten
        cost: p.voucher.taxType === "novst" ? p.sumGross : p.sumNet,
        voucherId: p.voucherId,
        voucherPositionId: p.id,
      },
    });
  }
}

// Beim Zurücksetzen eines Belegs auf Entwurf werden die daraus erzeugten Anlagegüter entfernt
export async function removeAssetsOfVoucher(voucherId: number) {
  const disposed = await db.asset.count({ where: { voucherId, disposalDate: { not: null } } });
  if (disposed) throw new Error("Zu diesem Beleg gibt es bereits ausgeschiedene Anlagegüter.");
  await db.asset.deleteMany({ where: { voucherId } });
}

export async function loadAssets() {
  await ensureAccountingTypes();
  await syncAssetsFromVouchers();
  return db.asset.findMany({ include: { accountingType: true, voucher: true }, orderBy: [{ acquisitionDate: "asc" }, { id: "asc" }] });
}

// Abschreibungsbeträge aller Anlagegüter mit Konto für EÜR und DATEV
export async function loadAfa(chart: "skr03" | "skr04") {
  const assets = await loadAssets();
  const items: AssetAfa[] = assets.flatMap((a) =>
    afaSchedule(a).map((i) => ({ ...i, name: a.name, account: { number: a.accountingType[chart], name: a.accountingType.name } })),
  );
  const warnings = assets.flatMap((a) => {
    const w = methodWarning(a);
    return w ? [{ source: "asset" as const, id: a.id, label: a.name, reason: w }] : [];
  });
  return { items, warnings };
}

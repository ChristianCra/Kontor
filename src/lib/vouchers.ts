import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { db } from "./db";
import { paymentStatus, voucherPositionSums } from "./calc";

export const VOUCHER_STATUS: Record<number, string> = {
  50: "Entwurf",
  100: "Offen",
  750: "Teilbezahlt",
  1000: "Bezahlt",
};

export const VOUCHER_TAX_TYPES: Record<"D" | "C", Record<string, string>> = {
  D: {
    default: "Vorsteuerabziehbare Aufwendungen",
    novst: "Nicht vorsteuerabziehbare Aufwendungen",
    igerwerb: "Innergemeinschaftlicher Erwerb",
    rc13b: "Reverse Charge §13b UStG",
  },
  C: {
    default: "Umsatzsteuerpflichtige Umsätze",
    eu: "Innergemeinschaftliche Lieferung (steuerfrei)",
    noteu: "Ausfuhr / nicht im Inland steuerbar",
  },
};

export const STORAGE_DIR = process.env.STORAGE_DIR ?? path.join(process.cwd(), "storage");

const ALLOWED_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/heic"];

export async function storeVoucherFile(voucherId: number, file: File) {
  if (!ALLOWED_TYPES.includes(file.type)) throw new Error("Erlaubt sind PDF, PNG, JPG, WEBP und HEIC.");
  if (file.size > 20 * 1024 * 1024) throw new Error("Die Datei ist größer als 20 MB.");
  const dir = path.join(STORAGE_DIR, "belege");
  await mkdir(dir, { recursive: true });
  const safeName = file.name.replace(/[^\w.\-äöüÄÖÜß]/g, "_").slice(-100);
  const filePath = path.join(dir, `${voucherId}-${Date.now()}-${safeName}`);
  const buf = Buffer.from(await file.arrayBuffer());
  await writeFile(filePath, buf);
  return { fileName: file.name, filePath, fileType: file.type, fileHash: createHash("sha256").update(buf).digest("hex") };
}

export async function recalcVoucher(id: number) {
  const v = await db.voucher.findUniqueOrThrow({ where: { id }, include: { positions: true } });
  let net = 0;
  let tax = 0;
  for (const p of v.positions) {
    const s = voucherPositionSums({ ...p, net: v.net }, v.taxType);
    net += s.net;
    tax += s.tax;
    await db.voucherPosition.update({ where: { id: p.id }, data: { sumNet: s.net, sumTax: s.tax, sumGross: s.gross } });
  }
  await db.voucher.update({ where: { id }, data: { sumNet: net, sumTax: tax, sumGross: net + tax } });
}

// Offen buchen: Beleg ist vollständig erfasst und wartet auf Zahlung
export async function finalizeVoucher(id: number) {
  await recalcVoucher(id);
  const v = await db.voucher.findUniqueOrThrow({ where: { id }, include: { positions: true } });
  if (v.status !== 50) throw new Error("Der Beleg ist bereits gebucht.");
  if (!v.positions.length) throw new Error("Der Beleg hat keine Positionen.");
  if (!v.supplierName && !v.supplierId) throw new Error(v.creditDebit === "D" ? "Lieferant fehlt." : "Kunde fehlt.");
  if (v.sumGross < 0) throw new Error("Der Gesamtbetrag darf nicht negativ sein.");
  if (!(v.taxType in VOUCHER_TAX_TYPES[v.creditDebit as "D" | "C"])) throw new Error("Die Steuerregel passt nicht zur Belegart.");
  await db.voucher.update({ where: { id }, data: { status: v.paidAmount > 0 ? paymentStatus(v.sumGross, v.paidAmount) : 100 } });
}

export async function voucherToDraft(id: number) {
  const v = await db.voucher.findUniqueOrThrow({ where: { id }, include: { payments: true } });
  if (v.enshrinedAt) throw new Error("Festgeschriebene Belege können nicht geändert werden.");
  if (v.payments.length) throw new Error("Belege mit Zahlungen können nicht zurückgesetzt werden.");
  await db.voucher.update({ where: { id }, data: { status: 50 } });
}

export function voucherStatusFor(gross: number, paid: number): number {
  const s = paymentStatus(gross, paid);
  return s === 200 ? 100 : s;
}

// Findet einen anderen Beleg mit identischer Datei
export async function findDuplicate(voucherId: number, fileHash: string | null | undefined) {
  if (!fileHash) return null;
  return db.voucher.findFirst({ where: { fileHash, id: { not: voucherId } } });
}

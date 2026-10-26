import { db } from "./db";
import { DEFAULT_ACCOUNTING_TYPES } from "./accounts-data";

export { DEFAULT_ACCOUNTING_TYPES };

// Legt fehlende Standardkonten an (auch neu hinzugekommene in bestehenden Datenbanken)
export async function ensureAccountingTypes() {
  const existing = new Set((await db.accountingType.findMany({ select: { skr03: true } })).map((a) => a.skr03));
  const missing = DEFAULT_ACCOUNTING_TYPES.filter((a) => !existing.has(a.skr03));
  if (missing.length) await db.accountingType.createMany({ data: missing });
}

export const KIND_LABEL: Record<string, string> = {
  EXPENSE: "Ausgabe",
  REVENUE: "Einnahme",
  ASSET: "Anlagevermögen",
  PRIVATE: "Privat",
  TAX: "Steuern",
};

import { db } from "./db";
import { DEFAULT_ACCOUNTING_TYPES } from "./accounts-data";

export { DEFAULT_ACCOUNTING_TYPES };

export async function ensureAccountingTypes() {
  if ((await db.accountingType.count()) > 0) return;
  await db.accountingType.createMany({ data: DEFAULT_ACCOUNTING_TYPES });
}

export const KIND_LABEL: Record<string, string> = {
  EXPENSE: "Ausgabe",
  REVENUE: "Einnahme",
  ASSET: "Anlagevermögen",
  PRIVATE: "Privat",
};

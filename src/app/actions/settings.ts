"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";

const CompanyForm = z.object({
  name: z.string().trim().min(1),
  street: z.string().trim(),
  zip: z.string().trim(),
  city: z.string().trim(),
  country: z.string().trim(),
  email: z.string().trim(),
  phone: z.string().trim(),
  taxNumber: z.string().trim(),
  vatId: z.string().trim(),
  iban: z.string().trim(),
  bic: z.string().trim(),
  bankName: z.string().trim(),
  defaultTimeToPay: z.coerce.number().int().min(0),
  smallBusiness: z.string().optional(),
  chartOfAccounts: z.enum(["skr03", "skr04"]),
  cashAccounting: z.enum(["ist", "soll"]),
  vatPeriod: z.enum(["MONTH", "QUARTER", "YEAR"]),
  datevAdvisor: z.string().trim().regex(/^\d{0,7}$/, "Beraternummer: bis zu 7 Ziffern"),
  datevClient: z.string().trim().regex(/^\d{0,5}$/, "Mandantennummer: bis zu 5 Ziffern"),
  fiscalYearStart: z.coerce.number().int().min(1).max(12),
  invoiceFormat: z.string().trim().min(1),
  customerFormat: z.string().trim().min(1),
});

export async function saveSettings(formData: FormData) {
  const { invoiceFormat, customerFormat, smallBusiness, cashAccounting, ...company } = CompanyForm.parse(Object.fromEntries(formData.entries()));
  const data = { ...company, smallBusiness: smallBusiness === "on", cashAccounting: cashAccounting === "ist" };
  await db.$transaction([
    db.company.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data }),
    db.numberSequence.upsert({ where: { type: "INVOICE" }, create: { type: "INVOICE", format: invoiceFormat }, update: { format: invoiceFormat } }),
    db.numberSequence.upsert({ where: { type: "CUSTOMER" }, create: { type: "CUSTOMER", format: customerFormat }, update: { format: customerFormat } }),
  ]);
  revalidatePath("/", "layout");
}

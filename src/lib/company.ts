import type { Company } from "@prisma/client";
import { db } from "./db";

export async function getCompany(): Promise<Company> {
  return (
    (await db.company.findUnique({ where: { id: 1 } })) ?? {
      id: 1, name: "Meine Firma", street: "", zip: "", city: "", country: "DE", email: "", phone: "",
      taxNumber: "", vatId: "", iban: "", bic: "", bankName: "", smallBusiness: false, defaultTimeToPay: 14, chartOfAccounts: "skr03",
    }
  );
}

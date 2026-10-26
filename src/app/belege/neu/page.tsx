import { db } from "@/lib/db";
import { ensureAccountingTypes } from "@/lib/accounts";
import { getCompany } from "@/lib/company";
import { VoucherForm } from "@/components/VoucherForm";

export const dynamic = "force-dynamic";

export default async function NewVoucher() {
  await ensureAccountingTypes();
  const [contacts, accountingTypes, company] = await Promise.all([
    db.contact.findMany({ orderBy: { customerNumber: "asc" } }),
    db.accountingType.findMany({ where: { active: true }, orderBy: { skr03: "asc" } }),
    getCompany(),
  ]);
  return (
    <div className="space-y-4">
      <h1 className="h1">Beleg erfassen</h1>
      <VoucherForm contacts={contacts} accountingTypes={accountingTypes} chart={company.chartOfAccounts as "skr03" | "skr04"} />
    </div>
  );
}

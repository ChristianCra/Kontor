"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { userActor } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { parseCents } from "@/lib/money";
import type { ActionResult } from "@/lib/draft";
import { parseBankFile, transactionHash } from "@/lib/bankimport";
import { linkTransaction, unlinkTransaction, type Target } from "@/lib/payments";
import { recalcVoucher } from "@/lib/vouchers";

async function run(accountId: number, fn: () => Promise<unknown>, action?: string, transactionId?: number, detail?: unknown): Promise<ActionResult> {
  try {
    await fn();
    if (action) await audit(await userActor(), action, "transaction", transactionId ?? null, detail);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  revalidatePath(`/bank/${accountId}`);
  revalidatePath("/bank");
  return {};
}

const AccountForm = z.object({
  name: z.string().trim().min(1),
  type: z.enum(["BANK", "CASH"]),
  iban: z.string().trim(),
  bic: z.string().trim(),
  openingBalance: z.string(),
  openingDate: z.string().min(1),
});

export async function createAccount(formData: FormData) {
  const a = AccountForm.parse(Object.fromEntries(formData.entries()));
  const account = await db.bankAccount.create({
    data: {
      name: a.name,
      type: a.type,
      iban: a.iban.replace(/\s/g, "").toUpperCase(),
      bic: a.bic,
      openingBalance: parseCents(a.openingBalance),
      openingDate: new Date(a.openingDate),
      ledgerAccount: a.type === "CASH" ? "1000" : "1200",
    },
  });
  redirect(`/bank/${account.id}`);
}

export type ImportResult = ActionResult & { imported?: number; skipped?: number };

export async function importTransactions(accountId: number, _prev: ImportResult, formData: FormData): Promise<ImportResult> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Bitte eine Datei auswählen." };
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    // Bank-CSVs sind oft ISO-8859-1 kodiert
    let content = buf.toString("utf8");
    if (content.includes("�")) content = buf.toString("latin1");
    const parsed = parseBankFile(file.name, content);
    let imported = 0;
    const rules = await db.privateRule.findMany();
    const isPrivate = (t: { payeeName: string; purpose: string }) =>
      rules.some(
        (r) =>
          (r.payeeName || r.purpose) &&
          (!r.payeeName || t.payeeName.toLowerCase().includes(r.payeeName.toLowerCase())) &&
          (!r.purpose || t.purpose.toLowerCase().includes(r.purpose.toLowerCase())),
      );
    const seen = new Map<string, number>();
    for (const t of parsed) {
      const key = [t.valueDate.toISOString(), t.amount, t.payeeIban, t.payeeName, t.purpose].join("|");
      const occurrence = (seen.get(key) ?? 0) + 1;
      seen.set(key, occurrence);
      const importHash = transactionHash(accountId, t, occurrence);
      const exists = await db.transaction.findUnique({ where: { importHash } });
      if (exists) continue;
      await db.transaction.create({ data: { ...t, accountId, importHash, status: isPrivate(t) ? 300 : 100 } });
      imported++;
    }
    await audit(await userActor(), "bank.import", "bankAccount", accountId, { file: file.name, imported });
    revalidatePath(`/bank/${accountId}`);
    return { imported, skipped: parsed.length - imported };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function addManualTransaction(accountId: number, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  return run(accountId, async () => {
    const amount = parseCents(String(formData.get("amount")));
    if (!amount) throw new Error("Betrag fehlt.");
    await db.transaction.create({
      data: {
        accountId,
        valueDate: new Date(String(formData.get("date"))),
        amount: formData.get("direction") === "out" ? -Math.abs(amount) : Math.abs(amount),
        payeeName: String(formData.get("payeeName") ?? ""),
        purpose: String(formData.get("purpose") ?? ""),
      },
    });
  });
}

export async function link(accountId: number, transactionId: number, target: Target): Promise<ActionResult> {
  return run(accountId, () => linkTransaction(transactionId, target), "transaction.link", transactionId, target);
}

export async function unlink(accountId: number, transactionId: number): Promise<ActionResult> {
  return run(accountId, () => unlinkTransaction(transactionId), "transaction.unlink", transactionId);
}

export async function markPrivate(accountId: number, transactionId: number, isPrivate: boolean): Promise<ActionResult> {
  return run(accountId, async () => {
    const t = await db.transaction.findUniqueOrThrow({ where: { id: transactionId }, include: { payments: true } });
    if (t.payments.length) throw new Error("Bitte zuerst die Zuordnung aufheben.");
    await db.transaction.update({ where: { id: transactionId }, data: { status: isPrivate ? 300 : 100 } });
  }, isPrivate ? "transaction.private" : "transaction.unprivate", transactionId);
}

// Legt aus einem Umsatz einen gebuchten und bezahlten Beleg an (z. B. Kontoführungsgebühren)
export async function voucherFromTransaction(accountId: number, transactionId: number, accountingTypeId: number, taxRate: number): Promise<ActionResult> {
  return run(accountId, async () => {
    const t = await db.transaction.findUniqueOrThrow({ where: { id: transactionId }, include: { payments: true } });
    if (t.payments.length) throw new Error("Der Umsatz ist bereits zugeordnet.");
    const v = await db.voucher.create({
      data: {
        creditDebit: t.amount < 0 ? "D" : "C",
        status: 100,
        supplierName: t.payeeName || "Unbekannt",
        voucherDate: t.valueDate,
        description: t.purpose.slice(0, 200),
        positions: { create: [{ accountingTypeId, taxRate, net: false, amount: Math.abs(t.amount) }] },
      },
    });
    await recalcVoucher(v.id);
    await linkTransaction(transactionId, { kind: t.amount < 0 ? "voucher" : "income", id: v.id });
    await audit(await userActor(), "voucher.fromTransaction", "voucher", v.id, { transactionId });
  });
}

export async function addPrivateRule(formData: FormData) {
  const payeeName = String(formData.get("payeeName") ?? "").trim();
  const purpose = String(formData.get("purpose") ?? "").trim();
  if (!payeeName && !purpose) return;
  await db.privateRule.create({ data: { payeeName, purpose } });
  revalidatePath("/bank");
}

export async function deletePrivateRule(id: number) {
  await db.privateRule.delete({ where: { id } });
  revalidatePath("/bank");
}

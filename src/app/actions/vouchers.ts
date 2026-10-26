"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { parseCents } from "@/lib/money";
import { optDate, type ActionResult } from "@/lib/draft";
import { finalizeVoucher, recalcVoucher, storeVoucherFile, voucherStatusFor, voucherToDraft } from "@/lib/vouchers";

const VoucherSchema = z.object({
  creditDebit: z.enum(["C", "D"]),
  supplierId: z.number().int().nullable(),
  supplierName: z.string().trim(),
  documentNumber: z.string().trim(),
  voucherDate: z.string().min(1, "Belegdatum fehlt."),
  deliveryDate: z.string(),
  dueDate: z.string(),
  taxType: z.enum(["default", "novst", "igerwerb", "rc13b", "eu", "noteu"]),
  net: z.boolean(),
  supplierIban: z.string().trim(),
  description: z.string(),
  positions: z.array(
    z.object({
      accountingTypeId: z.number().int(),
      taxRate: z.union([z.literal(0), z.literal(7), z.literal(19)]),
      amount: z.string(),
      comment: z.string(),
    }),
  ),
});

export type VoucherInput = z.infer<typeof VoucherSchema>;

async function run(id: number, fn: () => Promise<unknown>): Promise<ActionResult> {
  try {
    await fn();
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  revalidatePath(`/belege/${id}`);
  revalidatePath("/belege");
  return {};
}

async function persist(id: number | null, formData: FormData) {
  const input = VoucherSchema.parse(JSON.parse(String(formData.get("data"))));
  if (id) {
    const existing = await db.voucher.findUniqueOrThrow({ where: { id } });
    if (existing.status !== 50) throw new Error("Nur Entwürfe können bearbeitet werden.");
  }
  const supplier = input.supplierId ? await db.contact.findUnique({ where: { id: input.supplierId } }) : null;
  const data = {
    creditDebit: input.creditDebit,
    supplierId: input.supplierId,
    supplierName: input.supplierName || (supplier ? supplier.name ?? [supplier.firstName, supplier.lastName].filter(Boolean).join(" ") : ""),
    documentNumber: input.documentNumber,
    voucherDate: new Date(input.voucherDate),
    deliveryDate: optDate(input.deliveryDate),
    dueDate: optDate(input.dueDate),
    taxType: input.taxType,
    net: input.net,
    supplierIban: input.supplierIban.replace(/\s/g, "").toUpperCase(),
    description: input.description,
  };
  const positions = input.positions.map((p) => ({ ...p, net: input.net, amount: parseCents(p.amount) }));
  const voucher = await db.$transaction(async (tx) => {
    const v = id
      ? await tx.voucher.update({ where: { id }, data: { ...data, positions: { deleteMany: {}, create: positions } } })
      : await tx.voucher.create({ data: { ...data, positions: { create: positions } } });
    return v;
  });
  const file = formData.get("file");
  if (file instanceof File && file.size > 0) {
    const stored = await storeVoucherFile(voucher.id, file);
    await db.voucher.update({ where: { id: voucher.id }, data: stored });
  }
  await recalcVoucher(voucher.id);
  return voucher.id;
}

export async function saveVoucher(id: number | null, formData: FormData): Promise<ActionResult & { id?: number }> {
  let savedId: number | undefined;
  const r = await run(id ?? 0, async () => {
    savedId = await persist(id, formData);
  });
  return { ...r, id: savedId };
}

export async function saveAndBookVoucher(id: number | null, formData: FormData): Promise<ActionResult & { id?: number }> {
  let savedId: number | undefined;
  const r = await run(id ?? 0, async () => {
    savedId = await persist(id, formData);
    await finalizeVoucher(savedId);
  });
  return { ...r, id: savedId };
}

export async function voucherBackToDraft(id: number): Promise<ActionResult> {
  return run(id, () => voucherToDraft(id));
}

export async function enshrineVoucher(id: number): Promise<ActionResult> {
  return run(id, async () => {
    const v = await db.voucher.findUniqueOrThrow({ where: { id } });
    if (v.status === 50) throw new Error("Entwürfe können nicht festgeschrieben werden.");
    await db.voucher.update({ where: { id }, data: { enshrinedAt: new Date() } });
  });
}

export async function payVoucher(id: number, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  return run(id, async () => {
    const amount = parseCents(String(formData.get("amount")));
    if (amount <= 0) throw new Error("Der Betrag muss größer als 0 sein.");
    const accountId = Number(formData.get("accountId")) || null;
    await db.$transaction(async (tx) => {
      const v = await tx.voucher.findUniqueOrThrow({ where: { id } });
      if (v.status === 50) throw new Error("Bitte den Beleg zuerst buchen.");
      const paidAmount = v.paidAmount + amount;
      await tx.payment.create({ data: { voucherId: id, amount, accountId, date: new Date(String(formData.get("date"))), note: String(formData.get("note") ?? "") } });
      await tx.voucher.update({ where: { id }, data: { paidAmount, status: voucherStatusFor(v.sumGross, paidAmount) } });
    });
  });
}

export async function deleteVoucher(id: number) {
  const v = await db.voucher.findUniqueOrThrow({ where: { id }, include: { payments: true } });
  if (v.status !== 50 || v.payments.length) throw new Error("Nur Entwürfe ohne Zahlungen können gelöscht werden.");
  await db.voucher.delete({ where: { id } });
  revalidatePath("/belege");
  redirect("/belege");
}

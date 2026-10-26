"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { parseCents } from "@/lib/money";
import { DraftSchema, optDate, type ActionResult, type DraftInput } from "@/lib/draft";
import {
  assertEditable,
  bookPayment,
  cancelInvoice,
  createCreditNoteDraft,
  createDunningDraft,
  enshrineInvoice,
  finalizeInvoice,
  recalc,
  resetToDraft,
} from "@/lib/invoices";
import { formatAddress } from "@/lib/contacts";

async function run(id: number, fn: () => Promise<unknown>): Promise<ActionResult> {
  try {
    await fn();
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  revalidatePath(`/rechnungen/${id}`);
  revalidatePath("/rechnungen");
  return {};
}

export async function createInvoiceDraft(formData: FormData) {
  const contactId = Number(formData.get("contactId"));
  const contact = await db.contact.findUniqueOrThrow({ where: { id: contactId }, include: { addresses: true } });
  const company = await db.company.findUnique({ where: { id: 1 } });
  const billing = contact.addresses.find((a) => a.kind === "BILLING") ?? contact.addresses[0];
  const taxType = company?.smallBusiness ? "ss" : contact.taxType;
  const inv = await db.invoice.create({
    data: {
      contactId,
      address: formatAddress(contact, billing),
      invoiceDate: new Date(),
      deliveryDate: new Date(),
      timeToPay: contact.defaultTimeToPay ?? company?.defaultTimeToPay ?? 14,
      discount: contact.defaultDiscount,
      taxType,
      eInvoice: !!contact.buyerReference,
      headText: "Sehr geehrte Damen und Herren,\nvielen Dank für Ihren Auftrag. Wir berechnen Ihnen folgende Leistungen:",
      footText: "Mit freundlichen Grüßen",
    },
  });
  redirect(`/rechnungen/${inv.id}`);
}

export async function saveDraft(id: number, input: DraftInput): Promise<ActionResult> {
  return run(id, async () => {
    const d = DraftSchema.parse(input);
    const inv = await db.invoice.findUniqueOrThrow({ where: { id } });
    assertEditable(inv);
    await db.$transaction([
      db.invoicePosition.deleteMany({ where: { invoiceId: id } }),
      db.invoice.update({
        where: { id },
        data: {
          address: d.address,
          invoiceDate: new Date(d.date),
          deliveryDate: optDate(d.deliveryDate),
          deliveryDateUntil: optDate(d.deliveryDateUntil),
          timeToPay: d.timeToPay,
          headText: d.headText,
          footText: d.footText,
          taxType: d.taxType,
          discount: d.discount,
          customerReference: d.customerReference,
          eInvoice: d.eInvoice,
          positions: {
            create: d.positions.map((p, i) => ({
              position: i + 1,
              partId: p.partId,
              name: p.name,
              text: p.text,
              quantity: p.quantity,
              unit: p.unit,
              priceNet: parseCents(p.price),
              discount: p.discount,
              taxRate: p.taxRate,
            })),
          },
        },
      }),
    ]);
    await recalc(id);
  });
}

export async function saveAndFinalize(id: number, input: DraftInput): Promise<ActionResult> {
  const saved = await saveDraft(id, input);
  if (saved.error) return saved;
  return run(id, () => finalizeInvoice(id));
}

export async function deleteDraft(id: number) {
  const inv = await db.invoice.findUniqueOrThrow({ where: { id } });
  if (inv.status !== 100 || inv.invoiceNumber) throw new Error("Nur Entwürfe ohne Nummer können gelöscht werden.");
  await db.invoice.delete({ where: { id } });
  revalidatePath("/rechnungen");
  redirect("/rechnungen");
}

export async function markSent(id: number): Promise<ActionResult> {
  return run(id, () => db.invoice.update({ where: { id }, data: { sentAt: new Date() } }));
}

export async function addPayment(id: number, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  return run(id, () =>
    bookPayment(id, parseCents(String(formData.get("amount"))), new Date(String(formData.get("date"))), String(formData.get("note") ?? "")),
  );
}

export async function enshrine(id: number): Promise<ActionResult> {
  return run(id, () => enshrineInvoice(id));
}

export async function backToDraft(id: number): Promise<ActionResult> {
  return run(id, () => resetToDraft(id));
}

// Legt einen Folgebeleg an und wechselt dorthin
async function createAndOpen(id: number, fn: () => Promise<{ id: number }>): Promise<ActionResult> {
  let target: number | undefined;
  const result = await run(id, async () => {
    target = (await fn()).id;
  });
  if (result.error) return result;
  redirect(`/rechnungen/${target}`);
}

export async function cancel(id: number): Promise<ActionResult> {
  return createAndOpen(id, () => cancelInvoice(id));
}

export async function creditNote(id: number): Promise<ActionResult> {
  return createAndOpen(id, () => createCreditNoteDraft(id));
}

export async function dunning(id: number, fee: number): Promise<ActionResult> {
  return createAndOpen(id, () => createDunningDraft(id, fee));
}

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { parseCents } from "@/lib/money";
import { formatAddress } from "@/lib/contacts";
import { DraftSchema, optDate, type ActionResult, type DraftInput } from "@/lib/draft";
import { createFollowUpOrder, createInvoiceFromOrder, finalizeOrder, recalcOrder, resetOrderToDraft, setOrderStatus } from "@/lib/orders";
import { recalc } from "@/lib/invoices";

async function run(id: number, fn: () => Promise<unknown>): Promise<ActionResult> {
  try {
    await fn();
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  revalidatePath(`/angebote/${id}`);
  revalidatePath("/angebote");
  return {};
}

export async function createOrderDraft(formData: FormData) {
  const contactId = Number(formData.get("contactId"));
  const contact = await db.contact.findUniqueOrThrow({ where: { id: contactId }, include: { addresses: true } });
  const company = await db.company.findUnique({ where: { id: 1 } });
  const billing = contact.addresses.find((a) => a.kind === "BILLING") ?? contact.addresses[0];
  const validUntil = new Date();
  validUntil.setDate(validUntil.getDate() + 30);
  const o = await db.order.create({
    data: {
      contactId,
      address: formatAddress(contact, billing),
      orderDate: new Date(),
      validUntil,
      discount: contact.defaultDiscount,
      taxType: company?.smallBusiness ? "ss" : contact.taxType,
      headText: "Sehr geehrte Damen und Herren,\nvielen Dank für Ihre Anfrage. Gerne bieten wir Ihnen an:",
      footText: "Wir freuen uns auf Ihre Rückmeldung.\nMit freundlichen Grüßen",
    },
  });
  redirect(`/angebote/${o.id}`);
}

export async function saveOrderDraft(id: number, input: DraftInput): Promise<ActionResult> {
  return run(id, async () => {
    const d = DraftSchema.parse(input);
    const o = await db.order.findUniqueOrThrow({ where: { id } });
    if (o.status !== 100) throw new Error("Nur Entwürfe können bearbeitet werden.");
    await db.$transaction([
      db.orderPosition.deleteMany({ where: { orderId: id } }),
      db.order.update({
        where: { id },
        data: {
          address: d.address,
          orderDate: new Date(d.date),
          validUntil: optDate(d.validUntil),
          headText: d.headText,
          footText: d.footText,
          taxType: d.taxType,
          discount: d.discount,
          customerReference: d.customerReference,
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
              optional: p.optional ?? false,
            })),
          },
        },
      }),
    ]);
    await recalcOrder(id);
  });
}

export async function saveAndFinalizeOrder(id: number, input: DraftInput): Promise<ActionResult> {
  const saved = await saveOrderDraft(id, input);
  if (saved.error) return saved;
  return run(id, () => finalizeOrder(id));
}

export async function deleteOrderDraft(id: number) {
  const o = await db.order.findUniqueOrThrow({ where: { id } });
  if (o.status !== 100 || o.orderNumber) throw new Error("Nur Entwürfe ohne Nummer können gelöscht werden.");
  await db.order.delete({ where: { id } });
  revalidatePath("/angebote");
  redirect("/angebote");
}

export async function orderStatus(id: number, status: 300 | 500 | 200): Promise<ActionResult> {
  return run(id, () => setOrderStatus(id, status));
}

export async function orderBackToDraft(id: number): Promise<ActionResult> {
  return run(id, () => resetOrderToDraft(id));
}

export async function markOrderSent(id: number): Promise<ActionResult> {
  return run(id, () => db.order.update({ where: { id }, data: { sentAt: new Date() } }));
}

export async function followUp(id: number, type: "AB" | "LI"): Promise<ActionResult> {
  let target: number | undefined;
  const r = await run(id, async () => {
    target = (await createFollowUpOrder(id, type)).id;
  });
  if (r.error) return r;
  redirect(`/angebote/${target}`);
}

export async function invoiceFromOrder(id: number): Promise<ActionResult> {
  let target: number | undefined;
  const r = await run(id, async () => {
    const inv = await createInvoiceFromOrder(id);
    await recalc(inv.id);
    target = inv.id;
  });
  if (r.error) return r;
  redirect(`/rechnungen/${target}`);
}

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { parseCents } from "@/lib/money";
import {
  assertEditable,
  bookPayment,
  cancelInvoice,
  enshrineInvoice,
  finalizeInvoice,
  recalc,
  resetToDraft,
} from "@/lib/invoices";

export type ActionResult = { error?: string };

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

function formatAddress(contact: { name: string | null; firstName: string | null; lastName: string | null }, a?: { street: string; zip: string; city: string; country: string }) {
  const name = contact.name ?? [contact.firstName, contact.lastName].filter(Boolean).join(" ");
  const lines = [name];
  if (a) {
    if (a.street) lines.push(a.street);
    lines.push(`${a.zip} ${a.city}`.trim());
    if (a.country && a.country !== "DE") lines.push(a.country);
  }
  return lines.filter(Boolean).join("\n");
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
      headText: "Sehr geehrte Damen und Herren,\nvielen Dank für Ihren Auftrag. Wir berechnen Ihnen folgende Leistungen:",
      footText: "Mit freundlichen Grüßen",
    },
  });
  redirect(`/rechnungen/${inv.id}`);
}

const PositionSchema = z.object({
  partId: z.number().int().nullable(),
  name: z.string().trim().min(1, "Jede Position braucht eine Bezeichnung."),
  text: z.string(),
  quantity: z.number(),
  unit: z.string(),
  price: z.string(),
  discount: z.number().min(0).max(100),
  taxRate: z.number().min(0).max(100),
});

const DraftSchema = z.object({
  address: z.string().trim().min(1, "Empfängeradresse fehlt."),
  invoiceDate: z.string().min(1),
  deliveryDate: z.string(),
  deliveryDateUntil: z.string(),
  timeToPay: z.number().int().min(0),
  headText: z.string(),
  footText: z.string(),
  taxType: z.enum(["default", "eu", "noteu", "ss"]),
  discount: z.number().min(0).max(100),
  customerReference: z.string(),
  positions: z.array(PositionSchema),
});

export type DraftInput = z.infer<typeof DraftSchema>;

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
          invoiceDate: new Date(d.invoiceDate),
          deliveryDate: d.deliveryDate ? new Date(d.deliveryDate) : null,
          deliveryDateUntil: d.deliveryDateUntil ? new Date(d.deliveryDateUntil) : null,
          timeToPay: d.timeToPay,
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

export async function cancel(id: number): Promise<ActionResult> {
  let stornoId: number | undefined;
  const result = await run(id, async () => {
    stornoId = (await cancelInvoice(id)).id;
  });
  if (result.error) return result;
  redirect(`/rechnungen/${stornoId}`);
}

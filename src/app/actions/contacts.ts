"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { nextNumber } from "@/lib/sequence";

const ContactForm = z
  .object({
    kind: z.enum(["ORG", "PERSON"]),
    name: z.string().trim(),
    firstName: z.string().trim(),
    lastName: z.string().trim(),
    category: z.enum(["CUSTOMER", "SUPPLIER", "PARTNER"]),
    email: z.string().trim(),
    phone: z.string().trim(),
    vatId: z.string().trim(),
    taxNumber: z.string().trim(),
    iban: z.string().trim(),
    buyerReference: z.string().trim(),
    defaultTimeToPay: z.string().trim(),
    taxType: z.enum(["default", "eu", "noteu", "ss"]),
    note: z.string(),
    street: z.string().trim(),
    zip: z.string().trim(),
    city: z.string().trim(),
    country: z.string().trim().min(2),
  })
  .refine((c) => (c.kind === "ORG" ? c.name : c.lastName), { message: "Name fehlt" });

function parse(formData: FormData) {
  const raw = Object.fromEntries([...formData.entries()].map(([k, v]) => [k, String(v)]));
  const c = ContactForm.parse(raw);
  return {
    contact: {
      name: c.kind === "ORG" ? c.name : null,
      firstName: c.kind === "PERSON" ? c.firstName : null,
      lastName: c.kind === "PERSON" ? c.lastName : null,
      category: c.category,
      email: c.email,
      phone: c.phone,
      vatId: c.vatId,
      taxNumber: c.taxNumber,
      iban: c.iban.replace(/\s/g, "").toUpperCase(),
      buyerReference: c.buyerReference,
      defaultTimeToPay: c.defaultTimeToPay ? Number(c.defaultTimeToPay) : null,
      taxType: c.taxType,
      note: c.note,
    },
    address: { street: c.street, zip: c.zip, city: c.city, country: c.country.toUpperCase() },
  };
}

export async function createContact(formData: FormData) {
  const { contact, address } = parse(formData);
  const created = await db.$transaction(async (tx) => {
    const customerNumber = await nextNumber(tx, "CUSTOMER");
    return tx.contact.create({
      data: { ...contact, customerNumber, addresses: { create: { ...address, kind: "BILLING" } } },
    });
  });
  revalidatePath("/kontakte");
  redirect(`/kontakte/${created.id}`);
}

export async function updateContact(id: number, formData: FormData) {
  const { contact, address } = parse(formData);
  await db.$transaction(async (tx) => {
    await tx.contact.update({ where: { id }, data: contact });
    const billing = await tx.contactAddress.findFirst({ where: { contactId: id, kind: "BILLING" } });
    if (billing) await tx.contactAddress.update({ where: { id: billing.id }, data: address });
    else await tx.contactAddress.create({ data: { ...address, contactId: id, kind: "BILLING" } });
  });
  revalidatePath(`/kontakte/${id}`);
  redirect(`/kontakte/${id}`);
}

export async function deleteContact(id: number) {
  const count = await db.invoice.count({ where: { contactId: id } });
  if (count) throw new Error("Kontakte mit Rechnungen können nicht gelöscht werden.");
  await db.contact.delete({ where: { id } });
  revalidatePath("/kontakte");
  redirect("/kontakte");
}

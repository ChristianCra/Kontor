"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { parseCents } from "@/lib/money";

const PartForm = z.object({
  partNumber: z.string().trim().min(1, "Artikelnummer fehlt"),
  name: z.string().trim().min(1, "Name fehlt"),
  text: z.string(),
  unit: z.string().trim().min(1),
  priceNet: z.string(),
  pricePurchase: z.string(),
  taxRate: z.coerce.number().min(0).max(100),
  active: z.string().optional(),
});

async function parse(formData: FormData) {
  const p = PartForm.parse(Object.fromEntries(formData.entries()));
  const unit = await db.unit.upsert({ where: { name: p.unit }, create: { name: p.unit }, update: {} });
  return {
    partNumber: p.partNumber,
    name: p.name,
    text: p.text,
    unitId: unit.id,
    priceNet: parseCents(p.priceNet),
    pricePurchase: parseCents(p.pricePurchase),
    taxRate: p.taxRate,
    active: p.active === "on",
  };
}

export async function savePart(id: number | null, formData: FormData) {
  const data = await parse(formData);
  if (id) await db.part.update({ where: { id }, data });
  else await db.part.create({ data });
  revalidatePath("/artikel");
  redirect("/artikel");
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { parseCents } from "@/lib/money";

const AssetForm = z.object({
  name: z.string().trim().min(1, "Bezeichnung fehlt."),
  inventoryNumber: z.string().trim(),
  accountingTypeId: z.coerce.number().int(),
  method: z.enum(["linear", "digital", "gwg", "pool"]),
  acquisitionDate: z.string().min(1, "Anschaffungsdatum fehlt."),
  cost: z.string().min(1, "Anschaffungskosten fehlen."),
  usefulLifeYears: z.coerce.number().int().min(1).max(50),
  disposalDate: z.string(),
  disposalProceeds: z.string(),
  note: z.string(),
});

function parse(formData: FormData) {
  const r = AssetForm.safeParse(Object.fromEntries(formData.entries()));
  if (!r.success) return { error: r.error.issues[0].message };
  const f = r.data;
  let cost: number, disposalProceeds: number;
  try {
    cost = parseCents(f.cost);
    disposalProceeds = parseCents(f.disposalProceeds);
  } catch (e) {
    return { error: (e as Error).message };
  }
  if (cost <= 0) return { error: "Die Anschaffungskosten müssen größer als 0 sein." };
  const acquisitionDate = new Date(f.acquisitionDate);
  const disposalDate = f.disposalDate ? new Date(f.disposalDate) : null;
  if (disposalDate && disposalDate < acquisitionDate) return { error: "Der Abgang liegt vor der Anschaffung." };
  const usefulLifeYears = f.method === "pool" ? 5 : f.method === "linear" ? f.usefulLifeYears : 1;
  return {
    data: {
      name: f.name, inventoryNumber: f.inventoryNumber, accountingTypeId: f.accountingTypeId, method: f.method,
      acquisitionDate, cost, usefulLifeYears, disposalDate, disposalProceeds, note: f.note,
    },
  };
}

export async function createAsset(formData: FormData) {
  const r = parse(formData);
  if (r.error) redirect(`/anlagen/neu?fehler=${encodeURIComponent(r.error)}`);
  const a = await db.asset.create({ data: r.data! });
  revalidatePath("/anlagen");
  redirect(`/anlagen/${a.id}`);
}

export async function updateAsset(id: number, formData: FormData) {
  const r = parse(formData);
  if (r.error) redirect(`/anlagen/${id}?fehler=${encodeURIComponent(r.error)}`);
  const existing = await db.asset.findUniqueOrThrow({ where: { id } });
  // Aus Belegen erzeugte Anlagegüter behalten Kosten und Datum des Belegs
  const data = existing.voucherId ? { ...r.data!, cost: existing.cost, acquisitionDate: existing.acquisitionDate } : r.data!;
  await db.asset.update({ where: { id }, data });
  revalidatePath("/anlagen");
  redirect(`/anlagen/${id}?gespeichert=1`);
}

export async function deleteAsset(id: number) {
  const a = await db.asset.findUniqueOrThrow({ where: { id } });
  if (a.voucherId) redirect(`/anlagen/${id}?fehler=${encodeURIComponent("Anlagegüter aus Belegen entfernt man, indem man den Beleg auf Entwurf zurücksetzt.")}`);
  await db.asset.delete({ where: { id } });
  revalidatePath("/anlagen");
  redirect("/anlagen");
}

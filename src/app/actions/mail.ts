"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getCompany } from "@/lib/company";
import { invoiceFiles, orderFiles } from "@/lib/documents";
import { isMailAddress, sendMail, type MailDocType } from "@/lib/mail";

const SendForm = z.object({
  to: z.string(),
  cc: z.string(),
  subject: z.string().trim().min(1, "Betreff fehlt."),
  body: z.string().trim().min(1, "Nachricht fehlt."),
  xml: z.string().optional(),
});

const list = (s: string) => s.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);

function parse(formData: FormData) {
  const r = SendForm.safeParse(Object.fromEntries(formData.entries()));
  if (!r.success) return { error: r.error.issues[0].message };
  const to = list(r.data.to);
  const cc = list(r.data.cc);
  if (!to.length) return { error: "Empfänger fehlt." };
  const bad = [...to, ...cc].find((a) => !isMailAddress(a));
  if (bad) return { error: `Ungültige E-Mail-Adresse: ${bad}` };
  return { data: { ...r.data, to, cc } };
}

async function sender() {
  const company = await getCompany();
  if (process.env.MAIL_FROM) return process.env.MAIL_FROM;
  if (!company.email) throw new Error("Bitte eine Absender-Adresse (E-Mail in den Firmendaten oder MAIL_FROM) hinterlegen.");
  return `"${company.name.replace(/"/g, "")}" <${company.email}>`;
}

export async function sendInvoiceMail(id: number, formData: FormData) {
  const user = await requireUser();
  const fail = (m: string) => redirect(`/rechnungen/${id}/senden?fehler=${encodeURIComponent(m)}`);
  const r = parse(formData);
  if (r.error) fail(r.error);
  const files = await invoiceFiles(id);
  if (!files) fail("Rechnung nicht gefunden.");
  if (files!.inv.status === 100) fail("Bitte die Rechnung vor dem Versand abschließen.");
  const f = r.data!;
  const attachments = [{ filename: files!.filename, content: files!.pdf, contentType: "application/pdf" }];
  if (files!.xml && f.xml === "on") attachments.push({ filename: files!.filename.replace(/\.pdf$/, ".xml"), content: Buffer.from(files!.xml), contentType: "application/xml" });
  let result;
  try {
    result = await sendMail({ to: f.to, cc: f.cc, subject: f.subject, body: f.body, attachments }, await sender());
  } catch (e) {
    fail(`Versand fehlgeschlagen: ${(e as Error).message}`);
  }
  await db.$transaction([
    db.mailLog.create({ data: { docType: "invoice", docId: id, to: f.to.join(", "), cc: f.cc.join(", "), subject: f.subject, messageId: result!.messageId, testMode: result!.testMode, sentBy: user.email } }),
    db.invoice.update({ where: { id }, data: { sentAt: files!.inv.sentAt ?? new Date() } }),
  ]);
  revalidatePath(`/rechnungen/${id}`);
  redirect(`/rechnungen/${id}?versendet=${result!.testMode ? "test" : "1"}`);
}

export async function sendOrderMail(id: number, formData: FormData) {
  const user = await requireUser();
  const fail = (m: string) => redirect(`/angebote/${id}/senden?fehler=${encodeURIComponent(m)}`);
  const r = parse(formData);
  if (r.error) fail(r.error);
  const files = await orderFiles(id);
  if (!files) fail("Dokument nicht gefunden.");
  if (files!.order.status === 100) fail("Bitte den Entwurf vor dem Versand abschließen.");
  const f = r.data!;
  let result;
  try {
    result = await sendMail({ to: f.to, cc: f.cc, subject: f.subject, body: f.body, attachments: [{ filename: files!.filename, content: files!.pdf, contentType: "application/pdf" }] }, await sender());
  } catch (e) {
    fail(`Versand fehlgeschlagen: ${(e as Error).message}`);
  }
  await db.$transaction([
    db.mailLog.create({ data: { docType: "order", docId: id, to: f.to.join(", "), cc: f.cc.join(", "), subject: f.subject, messageId: result!.messageId, testMode: result!.testMode, sentBy: user.email } }),
    db.order.update({ where: { id }, data: { sentAt: files!.order.sentAt ?? new Date() } }),
  ]);
  revalidatePath(`/angebote/${id}`);
  redirect(`/angebote/${id}?versendet=${result!.testMode ? "test" : "1"}`);
}

const TemplateForm = z.object({ subject: z.string().trim().min(1), body: z.string().trim().min(1) });

export async function saveMailTemplate(docType: MailDocType, formData: FormData) {
  await requireUser();
  const t = TemplateForm.parse(Object.fromEntries(formData.entries()));
  await db.mailTemplate.upsert({ where: { docType }, create: { docType, ...t }, update: t });
  revalidatePath("/einstellungen/vorlagen");
  redirect("/einstellungen/vorlagen?ok=1");
}

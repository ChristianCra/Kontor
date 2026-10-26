import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import nodemailer from "nodemailer";
import { db } from "./db";
import { STORAGE_DIR } from "./vouchers";

export type MailDocType = "INVOICE" | "CREDIT_NOTE" | "DUNNING" | "ORDER";

export const MAIL_DOC_LABEL: Record<MailDocType, string> = {
  INVOICE: "Rechnung",
  CREDIT_NOTE: "Gutschrift",
  DUNNING: "Mahnung",
  ORDER: "Angebot / Auftrag",
};

export const MAIL_PLACEHOLDERS = ["{dokument}", "{nummer}", "{kunde}", "{betrag}", "{datum}", "{faellig}", "{firma}"];

const DEFAULTS: Record<MailDocType, { subject: string; body: string }> = {
  INVOICE: {
    subject: "{dokument} {nummer} von {firma}",
    body: "Guten Tag,\n\nanbei erhalten Sie unsere {dokument} {nummer} vom {datum} über {betrag}.\nBitte überweisen Sie den Betrag bis zum {faellig}.\n\nMit freundlichen Grüßen\n{firma}",
  },
  CREDIT_NOTE: {
    subject: "{dokument} {nummer} von {firma}",
    body: "Guten Tag,\n\nanbei erhalten Sie unsere {dokument} {nummer} vom {datum} über {betrag}.\n\nMit freundlichen Grüßen\n{firma}",
  },
  DUNNING: {
    subject: "{dokument} {nummer}",
    body: "Guten Tag,\n\nleider konnten wir zu unserer Rechnung noch keinen Zahlungseingang feststellen. Anbei erhalten Sie unsere {dokument} über {betrag}.\nBitte begleichen Sie den Betrag bis zum {faellig}.\n\nMit freundlichen Grüßen\n{firma}",
  },
  ORDER: {
    subject: "{dokument} {nummer} von {firma}",
    body: "Guten Tag,\n\nanbei erhalten Sie unser {dokument} {nummer} vom {datum}.\n\nWir freuen uns auf Ihre Rückmeldung.\n\nMit freundlichen Grüßen\n{firma}",
  },
};

export async function getTemplate(docType: MailDocType) {
  const t = await db.mailTemplate.findUnique({ where: { docType } });
  return t ?? { docType, ...DEFAULTS[docType] };
}

export function fillTemplate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);
}

export const isMailAddress = (s: string) => /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/.test(s);

export type Outgoing = {
  to: string[];
  cc: string[];
  subject: string;
  body: string;
  attachments: { filename: string; content: Buffer; contentType: string }[];
};

export const mailTestMode = () => !process.env.SMTP_URL;

// Versand per SMTP; ohne SMTP_URL wird die Nachricht als .eml-Datei in storage/outbox abgelegt
export async function sendMail(m: Outgoing, from: string) {
  const message = {
    from,
    to: m.to,
    cc: m.cc.length ? m.cc : undefined,
    subject: m.subject,
    text: m.body,
    attachments: m.attachments,
  };
  if (!mailTestMode()) {
    const info = await nodemailer.createTransport(process.env.SMTP_URL).sendMail(message);
    return { messageId: info.messageId as string, testMode: false, file: null };
  }
  const info = await nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "windows" }).sendMail(message);
  const dir = path.join(STORAGE_DIR, "outbox");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${Date.now()}-${m.subject.replace(/[^\w.\-äöüÄÖÜß]+/g, "_").slice(0, 60)}.eml`);
  await writeFile(file, info.message as Buffer);
  return { messageId: info.messageId as string, testMode: true, file };
}

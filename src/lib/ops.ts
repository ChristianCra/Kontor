// Fachliche Operationen für API, MCP-Server und Freigaben.
// Jede Operation prüft die Rechte des Akteurs und schreibt Änderungen ins Protokoll.
import { z } from "zod";
import { db } from "./db";
import { audit, type Actor } from "./audit";
import type { Scope } from "./api-tokens";
import { contactName } from "./contacts";
import { formatCents, formatDate } from "./money";
import { getCompany } from "./company";
import { loadJournal } from "./journal-data";
import { periodFor } from "./journal";
import { computeUstva } from "./ustva";
import { computeEuer, type EuerLine } from "./euer";
import { loadAfa } from "./assets";
import { isOverdue } from "./invoices";
import { loadOpenItems } from "./openitems";
import { suggestMatches } from "./matching";
import { linkTransaction as bookTransactionLink, type Target } from "./payments";
import { VOUCHER_STATUS, VOUCHER_TAX_TYPES, finalizeVoucher, findDuplicate, recalcVoucher, storeVoucherFile } from "./vouchers";

export class OpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function need(actor: Actor, scope: Scope) {
  if (actor.type === "token" && !actor.scopes?.includes(scope)) throw new OpError(403, `Dem Schlüssel fehlt das Recht „${scope}“.`);
}

const can = (actor: Actor, scope: Scope) => actor.type !== "token" || !!actor.scopes?.includes(scope);

const euros = (cents: number) => cents / 100;
const toCents = (eur: number) => Math.round(eur * 100);
const isoDate = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
// Zeiträume aus periodFor liegen auf lokaler Mitternacht
const localDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const DateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum im Format JJJJ-MM-TT erwartet.");

async function chart() {
  return (await getCompany()).chartOfAccounts as "skr03" | "skr04";
}

// ---------- Stammdaten ----------

export async function listAccountingTypes(actor: Actor) {
  need(actor, "read");
  const c = await chart();
  const types = await db.accountingType.findMany({ where: { active: true }, orderBy: { name: "asc" } });
  return types.map((t) => ({ id: t.id, name: t.name, kind: t.kind, account: t[c], defaultTaxRate: t.defaultTaxRate }));
}

export async function findContacts(actor: Actor, search = "") {
  need(actor, "read");
  const q = search.trim();
  const contacts = await db.contact.findMany({
    where: q ? { OR: [{ name: { contains: q } }, { firstName: { contains: q } }, { lastName: { contains: q } }, { customerNumber: { contains: q } }, { iban: { contains: q.replace(/\s/g, "").toUpperCase() } }] } : {},
    orderBy: { updatedAt: "desc" },
    take: 25,
  });
  return contacts.map((c) => ({ id: c.id, number: c.customerNumber, name: contactName(c), category: c.category, email: c.email, iban: c.iban, vatId: c.vatId }));
}

// ---------- Belege ----------

type VoucherWithPositions = NonNullable<Awaited<ReturnType<typeof loadVoucher>>>;

function loadVoucher(id: number) {
  return db.voucher.findUnique({ where: { id }, include: { positions: { include: { accountingType: true } } } });
}

function voucherView(v: VoucherWithPositions) {
  return {
    id: v.id,
    type: v.creditDebit === "D" ? "expense" : "income",
    status: v.status,
    statusLabel: VOUCHER_STATUS[v.status] ?? String(v.status),
    supplierId: v.supplierId,
    supplierName: v.supplierName,
    documentNumber: v.documentNumber,
    voucherDate: isoDate(v.voucherDate),
    deliveryDate: isoDate(v.deliveryDate),
    dueDate: isoDate(v.dueDate),
    taxType: v.taxType,
    amountsAreNet: v.net,
    description: v.description,
    net: euros(v.sumNet),
    tax: euros(v.sumTax),
    gross: euros(v.sumGross),
    paid: euros(v.paidAmount),
    open: euros(v.sumGross - v.paidAmount),
    hasFile: !!v.filePath,
    enshrined: !!v.enshrinedAt,
    path: `/belege/${v.id}`,
    positions: v.positions.map((p) => ({ accountingTypeId: p.accountingTypeId, accountingType: p.accountingType.name, taxRate: p.taxRate, amount: euros(p.amount), comment: p.comment })),
  };
}

export async function listVouchers(actor: Actor, opts: { status?: number; limit?: number } = {}) {
  need(actor, "read");
  const rows = await db.voucher.findMany({
    where: opts.status ? { status: opts.status } : {},
    orderBy: { voucherDate: "desc" },
    take: Math.min(opts.limit ?? 50, 200),
    include: { positions: { include: { accountingType: true } } },
  });
  return rows.map(voucherView);
}

export async function getVoucher(actor: Actor, id: number) {
  need(actor, "read");
  const v = await loadVoucher(id);
  if (!v) throw new OpError(404, `Beleg ${id} gibt es nicht.`);
  return voucherView(v);
}

export const FileSchema = z.object({ name: z.string().min(1), type: z.string().min(1), base64: z.string().min(1) });

export const VoucherDraftSchema = z.object({
  type: z.enum(["expense", "income"]),
  supplierId: z.number().int().optional(),
  supplierName: z.string().trim().default(""),
  documentNumber: z.string().trim().default(""),
  voucherDate: DateString,
  deliveryDate: DateString.optional(),
  dueDate: DateString.optional(),
  taxType: z.enum(["default", "novst", "igerwerb", "rc13b", "eu", "noteu"]).default("default"),
  amountsAreNet: z.boolean().default(false),
  supplierIban: z.string().trim().default(""),
  description: z.string().default(""),
  positions: z
    .array(
      z.object({
        accountingTypeId: z.number().int(),
        taxRate: z.union([z.literal(0), z.literal(7), z.literal(19)]),
        amount: z.number().positive("Beträge sind positiv, die Richtung ergibt sich aus type."),
        comment: z.string().default(""),
      }),
    )
    .min(1, "Mindestens eine Position angeben."),
  file: FileSchema.optional(),
});

export type VoucherDraftInput = z.input<typeof VoucherDraftSchema>;

export type UploadedFile = { name: string; type: string; data: Buffer };

const decodeFile = (f: z.infer<typeof FileSchema>): UploadedFile => ({ name: f.name, type: f.type, data: Buffer.from(f.base64, "base64") });

async function storeFile(voucherId: number, f: UploadedFile) {
  try {
    const stored = await storeVoucherFile(voucherId, new File([new Uint8Array(f.data)], f.name, { type: f.type }));
    await db.voucher.update({ where: { id: voucherId }, data: stored });
    return stored;
  } catch (e) {
    throw new OpError(422, e instanceof Error ? e.message : String(e));
  }
}

// Legt einen Belegentwurf an; Buchen ist ein eigener Schritt (book_voucher)
export async function createVoucherDraft(actor: Actor, raw: unknown, upload?: UploadedFile) {
  need(actor, "draft");
  const input = VoucherDraftSchema.parse(raw);
  const creditDebit = input.type === "expense" ? "D" : "C";
  if (!(input.taxType in VOUCHER_TAX_TYPES[creditDebit])) throw new OpError(422, `Die Steuerregel „${input.taxType}“ passt nicht zu ${input.type}.`);
  const typeIds = [...new Set(input.positions.map((p) => p.accountingTypeId))];
  const known = await db.accountingType.count({ where: { id: { in: typeIds }, active: true } });
  if (known !== typeIds.length) throw new OpError(422, "Unbekannte accountingTypeId. Gültige Werte liefert list_accounting_types.");
  const supplier = input.supplierId ? await db.contact.findUnique({ where: { id: input.supplierId } }) : null;
  if (input.supplierId && !supplier) throw new OpError(422, `Kontakt ${input.supplierId} gibt es nicht.`);
  const supplierName = input.supplierName || (supplier ? contactName(supplier) : "");

  const v = await db.voucher.create({
    data: {
      creditDebit,
      supplierId: supplier?.id ?? null,
      supplierName,
      documentNumber: input.documentNumber,
      voucherDate: new Date(input.voucherDate),
      deliveryDate: input.deliveryDate ? new Date(input.deliveryDate) : null,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      taxType: input.taxType,
      net: input.amountsAreNet,
      supplierIban: input.supplierIban.replace(/\s/g, "").toUpperCase(),
      description: input.description,
      positions: { create: input.positions.map((p) => ({ accountingTypeId: p.accountingTypeId, taxRate: p.taxRate, net: input.amountsAreNet, amount: toCents(p.amount), comment: p.comment })) },
    },
  });
  await recalcVoucher(v.id);
  const file = upload ?? (input.file ? decodeFile(input.file) : undefined);
  const stored = file ? await storeFile(v.id, file) : null;
  await audit(actor, "voucher.create", "voucher", v.id, { supplierName, documentNumber: input.documentNumber, file: stored?.fileName });

  const warnings: string[] = [];
  const dupFile = await findDuplicate(v.id, stored?.fileHash);
  if (dupFile) warnings.push(`Die Datei liegt schon an Beleg ${dupFile.id}.`);
  if (input.documentNumber) {
    const dup = await db.voucher.findFirst({ where: { id: { not: v.id }, documentNumber: input.documentNumber, supplierName } });
    if (dup) warnings.push(`Beleg ${dup.id} hat dieselbe Belegnummer beim selben Lieferanten.`);
  }
  return { voucher: voucherView((await loadVoucher(v.id))!), warnings };
}

export async function attachVoucherFile(actor: Actor, id: number, file: UploadedFile | z.infer<typeof FileSchema>) {
  need(actor, "draft");
  const v = await db.voucher.findUnique({ where: { id } });
  if (!v) throw new OpError(404, `Beleg ${id} gibt es nicht.`);
  if (v.enshrinedAt) throw new OpError(409, "Festgeschriebene Belege können nicht geändert werden.");
  if (v.status !== 50) throw new OpError(409, "Dateien lassen sich nur an Entwürfe hängen.");
  const stored = await storeFile(id, "base64" in file ? decodeFile(file) : file);
  await audit(actor, "voucher.file", "voucher", id, { file: stored.fileName });
  const dup = await findDuplicate(id, stored.fileHash);
  return { voucher: voucherView((await loadVoucher(id))!), warnings: dup ? [`Die Datei liegt schon an Beleg ${dup.id}.`] : [] };
}

// ---------- Bank ----------

const TX_STATUS: Record<number, string> = { 100: "Offen", 200: "Zugeordnet", 300: "Privat", 400: "Ohne Beleg gebucht" };

export async function listTransactions(actor: Actor, opts: { status?: number; accountId?: number; limit?: number } = {}) {
  need(actor, "read");
  const status = opts.status ?? 100;
  const [rows, items] = await Promise.all([
    db.transaction.findMany({
      where: { status, ...(opts.accountId ? { accountId: opts.accountId } : {}) },
      orderBy: { valueDate: "desc" },
      take: Math.min(opts.limit ?? 50, 200),
      include: { account: true, payments: true },
    }),
    status === 100 ? loadOpenItems() : Promise.resolve([]),
  ]);
  return rows.map((t) => ({
    id: t.id,
    account: t.account.name,
    valueDate: isoDate(t.valueDate),
    amount: euros(t.amount),
    payeeName: t.payeeName,
    payeeIban: t.payeeIban,
    purpose: t.purpose,
    status: t.status,
    statusLabel: TX_STATUS[t.status] ?? String(t.status),
    unassigned: euros(Math.abs(t.amount) - t.payments.reduce((s, p) => s + p.amount, 0)),
    suggestions: status === 100 ? suggestMatches(t, items).map((s) => ({ kind: s.kind, id: s.id, number: s.number, name: s.name, open: euros(s.open), score: s.score, reasons: s.reasons })) : [],
  }));
}

export async function listOpenItems(actor: Actor) {
  need(actor, "read");
  const items = await loadOpenItems();
  return items.map((i) => ({ kind: i.kind, id: i.id, number: i.number, name: i.name, open: euros(i.open), date: isoDate(i.date) }));
}

// ---------- Freigabepflichtige Schritte ----------

export const LinkSchema = z.object({
  transactionId: z.number().int(),
  kind: z.enum(["invoice", "credit", "voucher", "income"]),
  id: z.number().int(),
});

// Diese Schritte führt Kontor nach einer Freigabe (oder direkt mit Recht „book“) aus
const EXECUTORS: Record<string, (p: Record<string, unknown>) => Promise<unknown>> = {
  "voucher.book": async (p) => {
    await finalizeVoucher(Number(p.id));
  },
  "transaction.link": async (p) => {
    const l = LinkSchema.parse(p);
    await bookTransactionLink(l.transactionId, { kind: l.kind, id: l.id });
  },
  "transaction.private": async (p) => {
    const id = Number(p.transactionId);
    const t = await db.transaction.findUniqueOrThrow({ where: { id }, include: { payments: true } });
    if (t.payments.length) throw new Error("Bitte zuerst die Zuordnung aufheben.");
    await db.transaction.update({ where: { id }, data: { status: 300 } });
  },
};

async function bookOrPropose(actor: Actor, action: string, params: Record<string, unknown>, summary: string, entity: string, entityId: number, reason = "") {
  need(actor, "draft");
  if (can(actor, "book")) {
    try {
      await EXECUTORS[action](params);
    } catch (e) {
      throw new OpError(422, e instanceof Error ? e.message : String(e));
    }
    await audit(actor, action, entity, entityId, { ...params, reason });
    return { status: "done" as const, summary };
  }
  const existing = await db.approval.findFirst({ where: { action, params: JSON.stringify(params), status: "pending" } });
  if (existing) return { status: "pending" as const, approvalId: existing.id, summary, message: "Dieser Vorschlag wartet bereits auf Freigabe." };
  const a = await db.approval.create({ data: { action, params: JSON.stringify(params), summary, reason, requestedBy: actor.name } });
  await audit(actor, "approval.request", "approval", a.id, { action, params, reason });
  return { status: "pending" as const, approvalId: a.id, summary, message: "Zur Freigabe vorgelegt. Ein Mensch bestätigt den Schritt unter /freigaben." };
}

export async function bookVoucher(actor: Actor, id: number, reason = "") {
  need(actor, "draft");
  const v = await db.voucher.findUnique({ where: { id } });
  if (!v) throw new OpError(404, `Beleg ${id} gibt es nicht.`);
  if (v.status !== 50) throw new OpError(409, "Der Beleg ist bereits gebucht.");
  const summary = `Beleg ${id} buchen: ${v.supplierName || "ohne Lieferant"}${v.documentNumber ? `, Nr. ${v.documentNumber}` : ""}, ${formatCents(v.sumGross)} vom ${formatDate(v.voucherDate)}`;
  return bookOrPropose(actor, "voucher.book", { id }, summary, "voucher", id, reason);
}

async function targetLabel(t: Target) {
  if (t.kind === "invoice" || t.kind === "credit") {
    const inv = await db.invoice.findUnique({ where: { id: t.id }, include: { contact: true } });
    if (!inv) throw new OpError(404, `Rechnung ${t.id} gibt es nicht.`);
    return `${t.kind === "credit" ? "Gutschrift" : "Rechnung"} ${inv.invoiceNumber ?? inv.id} (${contactName(inv.contact)}, offen ${formatCents(inv.sumGross - inv.paidAmount)})`;
  }
  const v = await db.voucher.findUnique({ where: { id: t.id } });
  if (!v) throw new OpError(404, `Beleg ${t.id} gibt es nicht.`);
  return `Beleg ${v.id} (${v.supplierName}${v.documentNumber ? `, Nr. ${v.documentNumber}` : ""}, offen ${formatCents(v.sumGross - v.paidAmount)})`;
}

async function txLabel(id: number) {
  const t = await db.transaction.findUnique({ where: { id } });
  if (!t) throw new OpError(404, `Umsatz ${id} gibt es nicht.`);
  return { t, label: `Umsatz vom ${formatDate(t.valueDate)} über ${formatCents(t.amount)} (${t.payeeName || "ohne Namen"})` };
}

export async function linkTransaction(actor: Actor, raw: unknown, reason = "") {
  need(actor, "draft");
  const l = LinkSchema.parse(raw);
  const { t, label } = await txLabel(l.transactionId);
  if (t.status !== 100) throw new OpError(409, "Der Umsatz ist nicht mehr offen.");
  const summary = `${label} zuordnen zu ${await targetLabel(l)}`;
  return bookOrPropose(actor, "transaction.link", l, summary, "transaction", l.transactionId, reason);
}

export async function markTransactionPrivate(actor: Actor, transactionId: number, reason = "") {
  need(actor, "draft");
  const { t, label } = await txLabel(transactionId);
  if (t.status !== 100) throw new OpError(409, "Der Umsatz ist nicht mehr offen.");
  return bookOrPropose(actor, "transaction.private", { transactionId }, `${label} als privat markieren`, "transaction", transactionId, reason);
}

export async function listApprovals(actor: Actor, status = "pending") {
  need(actor, "read");
  const rows = await db.approval.findMany({ where: status === "all" ? {} : { status }, orderBy: { createdAt: "desc" }, take: 100 });
  return rows.map((a) => ({ id: a.id, action: a.action, summary: a.summary, reason: a.reason, status: a.status, requestedBy: a.requestedBy, decidedBy: a.decidedBy, error: a.error, createdAt: a.createdAt.toISOString() }));
}

// Nur Menschen entscheiden über Freigaben
export async function decideApproval(actor: Actor, id: number, approve: boolean) {
  if (actor.type !== "user") throw new OpError(403, "Freigaben erteilt nur ein angemeldeter Benutzer.");
  const a = await db.approval.findUnique({ where: { id } });
  if (!a) throw new OpError(404, `Freigabe ${id} gibt es nicht.`);
  if (a.status !== "pending") throw new OpError(409, "Über diese Freigabe wurde bereits entschieden.");
  const decided = { decidedBy: actor.name, decidedAt: new Date() };
  if (!approve) {
    await db.approval.update({ where: { id }, data: { ...decided, status: "rejected" } });
    await audit(actor, "approval.reject", "approval", id, { action: a.action });
    return;
  }
  try {
    await EXECUTORS[a.action](JSON.parse(a.params));
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await db.approval.update({ where: { id }, data: { ...decided, status: "failed", error } });
    await audit(actor, "approval.failed", "approval", id, { action: a.action, error });
    throw new OpError(422, error);
  }
  await db.approval.update({ where: { id }, data: { ...decided, status: "approved" } });
  await audit(actor, "approval.approve", "approval", id, { action: a.action, params: JSON.parse(a.params), requestedBy: a.requestedBy });
}

// ---------- Berichte ----------

export async function ustvaReport(actor: Actor, year: number, period: "MONTH" | "QUARTER" | "YEAR", index = 1) {
  need(actor, "read");
  const company = await getCompany();
  const p = periodFor(period, year, index);
  const r = computeUstva(await loadJournal(company.chartOfAccounts as "skr03" | "skr04"), p, company.cashAccounting);
  return {
    period: { from: localDate(p.from), toExclusive: localDate(p.to) },
    dueDate: localDate(new Date(p.to.getFullYear(), p.to.getMonth(), 10)),
    cashAccounting: company.cashAccounting,
    smallBusiness: company.smallBusiness,
    fields: r.fields.filter((f) => f.base || f.tax).map((f) => ({ key: f.key, label: f.label, baseCode: f.baseCode, taxCode: f.taxCode, base: euros(f.base), tax: euros(f.tax), documents: f.docs.length })),
    vat: euros(r.ust),
    inputTax: euros(r.vst),
    payable: euros(r.payable),
    unassigned: r.unassigned,
  };
}

export async function euerReport(actor: Actor, year: number) {
  need(actor, "read");
  const c = await chart();
  const afa = await loadAfa(c);
  const r = computeEuer(await loadJournal(c), periodFor("YEAR", year, 1), afa.items);
  const lines = (ls: EuerLine[]) => ls.filter((l) => l.amount).map((l) => ({ row: l.row, kz: l.kz, label: l.label, amount: euros(l.amount), accounts: [...l.accounts].map(([number, a]) => ({ number, name: a.name, amount: euros(a.amount) })) }));
  return { year, formYear: r.formYear, income: lines(r.income), expenses: lines(r.expenses), nonDeductible: lines(r.nonDeductible), totalIncome: euros(r.totalIncome), totalExpenses: euros(r.totalExpenses), profit: euros(r.profit), warnings: r.warnings };
}

// Was braucht gerade Aufmerksamkeit? Grundlage für ein tägliches Briefing
export async function attention(actor: Actor) {
  need(actor, "read");
  const now = new Date();
  const [openTx, drafts, withoutFile, invoices, pending, company] = await Promise.all([
    db.transaction.findMany({ where: { status: 100 }, select: { amount: true } }),
    db.voucher.count({ where: { status: 50 } }),
    db.voucher.count({ where: { status: { not: 50 }, filePath: null } }),
    db.invoice.findMany({ where: { status: { in: [200, 750] }, type: { in: ["RE", "AR", "TR", "ER"] } }, include: { contact: true } }),
    db.approval.count({ where: { status: "pending" } }),
    getCompany(),
  ]);
  const overdue = invoices.filter((i) => isOverdue(i, now));
  return {
    date: isoDate(now),
    openTransactions: { count: openTx.length, sum: euros(openTx.reduce((s, t) => s + t.amount, 0)) },
    draftVouchers: drafts,
    bookedVouchersWithoutFile: withoutFile,
    overdueInvoices: overdue.map((i) => {
      const due = new Date(i.invoiceDate);
      due.setDate(due.getDate() + i.timeToPay);
      return { id: i.id, number: i.invoiceNumber, contact: contactName(i.contact), open: euros(i.sumGross - i.paidAmount), dueDate: isoDate(due) };
    }),
    pendingApprovals: pending,
    nextVatReturn: company.smallBusiness ? null : nextVatReturn(company.vatPeriod as "MONTH" | "QUARTER" | "YEAR", now),
  };
}

// Nächste fällige Voranmeldung: am 10. des Monats nach Ende des Zeitraums (ohne Dauerfristverlängerung)
export function nextVatReturn(kind: "MONTH" | "QUARTER" | "YEAR", now: Date) {
  const index = kind === "MONTH" ? now.getMonth() + 1 : kind === "QUARTER" ? Math.floor(now.getMonth() / 3) + 1 : 1;
  const current = periodFor(kind, now.getFullYear(), index);
  const previous = index > 1 ? periodFor(kind, now.getFullYear(), index - 1) : periodFor(kind, now.getFullYear() - 1, kind === "MONTH" ? 12 : kind === "QUARTER" ? 4 : 1);
  const due = (p: { to: Date }) => new Date(p.to.getFullYear(), p.to.getMonth(), 10);
  const p = due(previous) >= new Date(now.getFullYear(), now.getMonth(), now.getDate()) ? previous : current;
  return { period: { from: localDate(p.from), toExclusive: localDate(p.to) }, dueDate: localDate(due(p)) };
}

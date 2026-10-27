import { NextResponse, type NextRequest } from "next/server";
import { actorFromBearer } from "@/lib/api-tokens";
import type { Actor } from "@/lib/audit";
import { errorResponse } from "@/lib/http";
import * as ops from "@/lib/ops";

// REST-API für Automatisierung, z. B. durch Claude. Anmeldung per "Authorization: Bearer kontor_…".
// Beträge sind Euro als Dezimalzahl, Datumsangaben JJJJ-MM-TT.

type Ctx = { actor: Actor; req: NextRequest; params: string[]; query: URLSearchParams };
type Handler = (c: Ctx) => Promise<unknown>;

const num = (s: string | null) => (s ? Number(s) : undefined);
const id = (s: string) => {
  const n = Number(s);
  if (!Number.isInteger(n) || n <= 0) throw new ops.OpError(404, "Unbekannte ID.");
  return n;
};
const body = async (req: NextRequest) => {
  const text = await req.text();
  return text ? JSON.parse(text) : {};
};

async function readUpload(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) throw new ops.OpError(422, "Feld „file“ fehlt.");
  return { form, file: { name: file.name, type: file.type, data: Buffer.from(await file.arrayBuffer()) } };
}

const ROUTES: [method: string, pattern: string, handler: Handler][] = [
  ["GET", "me", async ({ actor }) => ({ name: actor.name, scopes: actor.scopes })],
  ["GET", "attention", ({ actor }) => ops.attention(actor)],
  ["GET", "accounting-types", ({ actor }) => ops.listAccountingTypes(actor)],
  ["GET", "contacts", ({ actor, query }) => ops.findContacts(actor, query.get("search") ?? "")],
  ["GET", "open-items", ({ actor }) => ops.listOpenItems(actor)],
  ["GET", "vouchers", ({ actor, query }) => ops.listVouchers(actor, { status: num(query.get("status")), limit: num(query.get("limit")) })],
  [
    "POST",
    "vouchers",
    async ({ actor, req }) => {
      // JSON oder multipart/form-data mit Feld "data" (JSON) und "file"
      if (req.headers.get("content-type")?.includes("multipart/form-data")) {
        const { form, file } = await readUpload(req);
        return ops.createVoucherDraft(actor, JSON.parse(String(form.get("data") ?? "{}")), file);
      }
      return ops.createVoucherDraft(actor, await body(req));
    },
  ],
  ["GET", "vouchers/:id", ({ actor, params }) => ops.getVoucher(actor, id(params[0]))],
  ["POST", "vouchers/:id/file", async ({ actor, req, params }) => ops.attachVoucherFile(actor, id(params[0]), (await readUpload(req)).file)],
  ["POST", "vouchers/:id/book", async ({ actor, req, params }) => ops.bookVoucher(actor, id(params[0]), (await body(req)).reason ?? "")],
  ["GET", "transactions", ({ actor, query }) => ops.listTransactions(actor, { status: num(query.get("status")), accountId: num(query.get("accountId")), limit: num(query.get("limit")) })],
  [
    "POST",
    "transactions/:id/link",
    async ({ actor, req, params }) => {
      const b = await body(req);
      return ops.linkTransaction(actor, { transactionId: id(params[0]), kind: b.kind, id: b.id }, b.reason ?? "");
    },
  ],
  ["POST", "transactions/:id/private", async ({ actor, req, params }) => ops.markTransactionPrivate(actor, id(params[0]), (await body(req)).reason ?? "")],
  ["GET", "approvals", ({ actor, query }) => ops.listApprovals(actor, query.get("status") ?? "pending")],
  [
    "GET",
    "reports/ustva",
    ({ actor, query }) => {
      const period = (query.get("period") ?? "QUARTER").toUpperCase();
      if (period !== "MONTH" && period !== "QUARTER" && period !== "YEAR") throw new ops.OpError(422, "period ist MONTH, QUARTER oder YEAR.");
      return ops.ustvaReport(actor, num(query.get("year")) ?? new Date().getFullYear(), period, num(query.get("index")) ?? 1);
    },
  ],
  ["GET", "reports/euer", ({ actor, query }) => ops.euerReport(actor, num(query.get("year")) ?? new Date().getFullYear())],
];

function match(method: string, path: string[]) {
  for (const [m, pattern, handler] of ROUTES) {
    if (m !== method) continue;
    const parts = pattern.split("/");
    if (parts.length !== path.length) continue;
    const params: string[] = [];
    if (parts.every((p, i) => (p === ":id" ? (params.push(path[i]), true) : p === path[i]))) return { handler, params };
  }
  return null;
}

async function handle(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const route = match(req.method, (await params).path);
  if (!route) return NextResponse.json({ error: "Unbekannter Endpunkt." }, { status: 404 });
  const actor = await actorFromBearer(req.headers.get("authorization"));
  if (!actor) return NextResponse.json({ error: "Gültiger API-Schlüssel fehlt." }, { status: 401, headers: { "WWW-Authenticate": "Bearer" } });
  try {
    return NextResponse.json(await route.handler({ actor, req, params: route.params, query: req.nextUrl.searchParams }));
  } catch (e) {
    return errorResponse(e);
  }
}

export { handle as GET, handle as POST };

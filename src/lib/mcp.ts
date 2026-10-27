// MCP-Server (Model Context Protocol) über Streamable HTTP, zustandslos mit JSON-Antworten.
// Damit lässt sich Kontor als Connector in Claude einbinden.
import type { Actor } from "./audit";
import type { Scope } from "./api-tokens";
import { errorInfo } from "./http";
import * as ops from "./ops";

export const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

const INSTRUCTIONS = `Kontor ist eine Buchhaltung für Selbstständige und kleine Unternehmen in Deutschland.
Beträge sind Euro als Dezimalzahl, Datumsangaben JJJJ-MM-TT.
Typischer Ablauf: get_attention für den Überblick; Belege mit create_voucher_draft als Entwurf anlegen (Konto aus list_accounting_types, Lieferant aus find_contacts);
mit book_voucher buchen; offene Bankumsätze mit list_transactions holen und über link_transaction einer Rechnung oder einem Beleg zuordnen.
Buchen und Zuordnen werden je nach Recht des Schlüssels direkt ausgeführt oder einem Menschen zur Freigabe vorgelegt (Antwort status "pending").
Festschreiben, Versenden und Löschen sind über diese Schnittstelle nicht möglich.`;

type Tool = {
  name: string;
  description: string;
  scope: Scope;
  readOnly?: boolean;
  inputSchema: Record<string, unknown>;
  run: (actor: Actor, args: Record<string, unknown>) => Promise<unknown>;
};

const obj = (properties: Record<string, unknown> = {}, required: string[] = []) => ({ type: "object", properties, required, additionalProperties: false });
const int = (description: string) => ({ type: "integer", description });
const str = (description: string) => ({ type: "string", description });
const date = (description: string) => ({ type: "string", format: "date", description });
const reason = str("Kurze Begründung, warum der Schritt richtig ist. Erscheint in der Freigabe-Liste.");
const file = {
  type: "object",
  description: "Belegdatei (PDF, PNG, JPG, WEBP, HEIC, max. 20 MB)",
  properties: { name: str("Dateiname"), type: str("MIME-Typ, z. B. application/pdf"), base64: str("Dateiinhalt Base64-kodiert") },
  required: ["name", "type", "base64"],
};
const n = (v: unknown) => (v === undefined || v === null ? undefined : Number(v));

export const TOOLS: Tool[] = [
  {
    name: "get_attention",
    description: "Überblick, was gerade Aufmerksamkeit braucht: offene Bankumsätze, Belegentwürfe, gebuchte Belege ohne Datei, überfällige Rechnungen, offene Freigaben und die nächste UStVA-Frist.",
    scope: "read",
    readOnly: true,
    inputSchema: obj(),
    run: (a) => ops.attention(a),
  },
  {
    name: "list_accounting_types",
    description: "Buchungskonten (Kategorien) mit ID, Kontonummer im gewählten Kontenrahmen und üblichem Steuersatz. Die ID wird für Belegpositionen gebraucht.",
    scope: "read",
    readOnly: true,
    inputSchema: obj(),
    run: (a) => ops.listAccountingTypes(a),
  },
  {
    name: "find_contacts",
    description: "Sucht Kunden und Lieferanten nach Name, Kundennummer oder IBAN.",
    scope: "read",
    readOnly: true,
    inputSchema: obj({ search: str("Suchbegriff, leer für die zuletzt geänderten") }),
    run: (a, x) => ops.findContacts(a, String(x.search ?? "")),
  },
  {
    name: "list_open_items",
    description: "Offene Rechnungen, Gutschriften und Belege mit offenem Betrag.",
    scope: "read",
    readOnly: true,
    inputSchema: obj(),
    run: (a) => ops.listOpenItems(a),
  },
  {
    name: "list_vouchers",
    description: "Belege, neueste zuerst. Status: 50 Entwurf, 100 offen, 750 teilbezahlt, 1000 bezahlt.",
    scope: "read",
    readOnly: true,
    inputSchema: obj({ status: { type: "integer", enum: [50, 100, 750, 1000] }, limit: int("Höchstens so viele, Standard 50") }),
    run: (a, x) => ops.listVouchers(a, { status: n(x.status), limit: n(x.limit) }),
  },
  {
    name: "get_voucher",
    description: "Ein Beleg mit Positionen.",
    scope: "read",
    readOnly: true,
    inputSchema: obj({ id: int("Beleg-ID") }, ["id"]),
    run: (a, x) => ops.getVoucher(a, Number(x.id)),
  },
  {
    name: "create_voucher_draft",
    description:
      "Legt einen Beleg (Eingangsrechnung, Quittung oder Einnahme) als Entwurf an. Beträge je Position brutto, außer amountsAreNet ist true. Bei mehreren Steuersätzen je Satz eine Position. Liefert Warnungen bei möglichen Dubletten.",
    scope: "draft",
    inputSchema: obj(
      {
        type: { type: "string", enum: ["expense", "income"], description: "expense = Ausgabe, income = Einnahme" },
        supplierId: int("Kontakt-ID aus find_contacts, falls vorhanden"),
        supplierName: str("Name des Lieferanten bzw. Kunden, wenn es keinen Kontakt gibt"),
        documentNumber: str("Rechnungsnummer auf dem Beleg"),
        voucherDate: date("Belegdatum"),
        deliveryDate: date("Leistungsdatum"),
        dueDate: date("Fälligkeit"),
        taxType: {
          type: "string",
          enum: ["default", "novst", "igerwerb", "rc13b", "eu", "noteu"],
          description: "Ausgabe: default (Vorsteuer abziehbar), novst (ohne Vorsteuerabzug), igerwerb (innergemeinschaftlicher Erwerb), rc13b (Reverse Charge). Einnahme: default, eu, noteu.",
        },
        amountsAreNet: { type: "boolean", description: "true, wenn die Beträge netto angegeben sind" },
        supplierIban: str("IBAN des Lieferanten"),
        description: str("Beschreibung"),
        positions: {
          type: "array",
          minItems: 1,
          items: obj(
            { accountingTypeId: int("ID aus list_accounting_types"), taxRate: { type: "number", enum: [0, 7, 19] }, amount: { type: "number", description: "Betrag in Euro, positiv" }, comment: str("Text zur Position") },
            ["accountingTypeId", "taxRate", "amount"],
          ),
        },
        file,
      },
      ["type", "voucherDate", "positions"],
    ),
    run: (a, x) => ops.createVoucherDraft(a, x),
  },
  {
    name: "attach_voucher_file",
    description: "Hängt die Belegdatei an einen Entwurf.",
    scope: "draft",
    inputSchema: obj({ id: int("Beleg-ID"), file }, ["id", "file"]),
    run: (a, x) => ops.attachVoucherFile(a, Number(x.id), ops.FileSchema.parse(x.file)),
  },
  {
    name: "book_voucher",
    description: "Bucht einen Belegentwurf (Status offen). Ohne Recht „book“ wird der Schritt zur Freigabe vorgelegt.",
    scope: "draft",
    inputSchema: obj({ id: int("Beleg-ID"), reason }, ["id"]),
    run: (a, x) => ops.bookVoucher(a, Number(x.id), String(x.reason ?? "")),
  },
  {
    name: "list_transactions",
    description: "Bankumsätze, Standard: offene (Status 100) mit Zuordnungsvorschlägen. Betrag positiv = Eingang, negativ = Ausgang.",
    scope: "read",
    readOnly: true,
    inputSchema: obj({ status: { type: "integer", enum: [100, 200, 300, 400] }, accountId: int("Nur dieses Bankkonto"), limit: int("Höchstens so viele, Standard 50") }),
    run: (a, x) => ops.listTransactions(a, { status: n(x.status), accountId: n(x.accountId), limit: n(x.limit) }),
  },
  {
    name: "link_transaction",
    description: "Ordnet einen Bankumsatz einer Rechnung (invoice), Gutschrift (credit), Ausgabe (voucher) oder Einnahme (income) zu und bucht die Zahlung. Ohne Recht „book“ wird der Schritt zur Freigabe vorgelegt.",
    scope: "draft",
    inputSchema: obj({ transactionId: int("Umsatz-ID"), kind: { type: "string", enum: ["invoice", "credit", "voucher", "income"] }, id: int("ID der Rechnung bzw. des Belegs"), reason }, ["transactionId", "kind", "id"]),
    run: (a, x) => ops.linkTransaction(a, { transactionId: x.transactionId, kind: x.kind, id: x.id }, String(x.reason ?? "")),
  },
  {
    name: "mark_transaction_private",
    description: "Markiert einen Umsatz als privat (z. B. Privatentnahme). Ohne Recht „book“ wird der Schritt zur Freigabe vorgelegt.",
    scope: "draft",
    inputSchema: obj({ transactionId: int("Umsatz-ID"), reason }, ["transactionId"]),
    run: (a, x) => ops.markTransactionPrivate(a, Number(x.transactionId), String(x.reason ?? "")),
  },
  {
    name: "list_approvals",
    description: "Vorgeschlagene Schritte und ihr Stand (pending, approved, rejected, failed oder all).",
    scope: "read",
    readOnly: true,
    inputSchema: obj({ status: { type: "string", enum: ["pending", "approved", "rejected", "failed", "all"] } }),
    run: (a, x) => ops.listApprovals(a, String(x.status ?? "pending")),
  },
  {
    name: "get_ustva",
    description: "Werte der Umsatzsteuer-Voranmeldung je Kennzahl für einen Zeitraum.",
    scope: "read",
    readOnly: true,
    inputSchema: obj({ year: int("Jahr"), period: { type: "string", enum: ["MONTH", "QUARTER", "YEAR"] }, index: int("Monat 1–12 bzw. Quartal 1–4") }, ["year", "period"]),
    run: (a, x) => ops.ustvaReport(a, Number(x.year), x.period as "MONTH" | "QUARTER" | "YEAR", n(x.index) ?? 1),
  },
  {
    name: "get_euer",
    description: "Einnahmen-Überschuss-Rechnung eines Jahres nach Zeilen der Anlage EÜR.",
    scope: "read",
    readOnly: true,
    inputSchema: obj({ year: int("Jahr") }, ["year"]),
    run: (a, x) => ops.euerReport(a, Number(x.year)),
  },
];

type RpcRequest = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Record<string, unknown> };

const allowed = (actor: Actor, t: Tool) => actor.type !== "token" || !!actor.scopes?.includes(t.scope);

async function dispatch(actor: Actor, msg: RpcRequest): Promise<unknown> {
  switch (msg.method) {
    case "initialize": {
      const requested = String(msg.params?.protocolVersion ?? "");
      return {
        protocolVersion: PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "kontor", title: "Kontor Buchhaltung", version: "1.0.0" },
        instructions: INSTRUCTIONS,
      };
    }
    case "ping":
      return {};
    case "tools/list":
      return {
        tools: TOOLS.filter((t) => allowed(actor, t)).map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
          annotations: { readOnlyHint: !!t.readOnly, destructiveHint: false, openWorldHint: false },
        })),
      };
    case "tools/call": {
      const tool = TOOLS.find((t) => t.name === msg.params?.name);
      if (!tool) throw new RpcError(-32602, `Unbekanntes Werkzeug: ${String(msg.params?.name)}`);
      if (!allowed(actor, tool)) return { content: [{ type: "text", text: `Dem Schlüssel fehlt das Recht „${tool.scope}“.` }], isError: true };
      try {
        const result = await tool.run(actor, (msg.params?.arguments as Record<string, unknown>) ?? {});
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], isError: false };
      } catch (e) {
        // Fachliche Fehler gehen als Werkzeug-Ergebnis zurück, damit das Modell reagieren kann
        return { content: [{ type: "text", text: errorInfo(e).message }], isError: true };
      }
    }
    default:
      throw new RpcError(-32601, `Unbekannte Methode: ${msg.method}`);
  }
}

class RpcError extends Error {
  constructor(
    public code: number,
    message: string,
  ) {
    super(message);
  }
}

// Verarbeitet eine Nachricht oder ein Batch; null bedeutet: nur Benachrichtigungen, keine Antwort
export async function handleRpc(actor: Actor, payload: unknown): Promise<unknown | null> {
  const one = async (m: unknown) => {
    const msg = m as RpcRequest;
    if (!msg || typeof msg !== "object" || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
      return { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Ungültige Anfrage." } };
    }
    if (msg.id === undefined) return null; // Benachrichtigung, z. B. notifications/initialized
    try {
      return { jsonrpc: "2.0", id: msg.id, result: await dispatch(actor, msg) };
    } catch (e) {
      return { jsonrpc: "2.0", id: msg.id, error: { code: e instanceof RpcError ? e.code : -32603, message: e instanceof Error ? e.message : String(e) } };
    }
  };
  if (Array.isArray(payload)) {
    const results = (await Promise.all(payload.map(one))).filter((r) => r !== null);
    return results.length ? results : null;
  }
  return one(payload);
}

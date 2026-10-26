import { createHash } from "node:crypto";
import { XMLParser } from "fast-xml-parser";

export type ParsedTransaction = {
  valueDate: Date;
  amount: number; // Cent, Eingang positiv
  payeeName: string;
  payeeIban: string;
  purpose: string;
};

// Kennung für die Dublettenprüfung beim wiederholten Import desselben Zeitraums
export function transactionHash(accountId: number, t: ParsedTransaction, occurrence: number): string {
  return createHash("sha256")
    .update([accountId, t.valueDate.toISOString().slice(0, 10), t.amount, t.payeeIban, t.payeeName, t.purpose, occurrence].join("|"))
    .digest("hex");
}

function parseGermanDate(s: string): Date | null {
  const m = s.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
  if (m) {
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return new Date(Date.UTC(year, Number(m[2]) - 1, Number(m[1])));
  }
  const iso = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
  return null;
}

function parseAmount(s: string): number {
  let v = s.trim().replace(/\s|€|EUR/g, "");
  if (/,\d{1,2}$/.test(v)) v = v.replace(/\./g, "").replace(",", ".");
  else v = v.replace(/,/g, "");
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`Betrag nicht lesbar: ${s}`);
  return Math.round(n * 100);
}

function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === sep && !quoted) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-zäöüß]/g, "");

// Spaltennamen gängiger deutscher Banken (Sparkasse, Volksbank, DKB, ING, Commerzbank, N26 …)
const COLUMNS = {
  date: ["valutadatum", "wertstellung", "buchungstag", "buchungsdatum", "datum", "date"],
  amount: ["betrag", "betrageur", "umsatz", "amount", "betragineur"],
  name: ["beguenstigterzahlungspflichtiger", "begünstigterzahlungspflichtiger", "namezahlungsbeteiligter", "auftraggeberempfänger", "empfänger", "zahlungsempfänger", "auftraggeber", "name", "payee"],
  iban: ["kontonummeriban", "ibanzahlungsbeteiligter", "iban", "kontonummer"],
  purpose: ["verwendungszweck", "buchungstext", "vorgang", "purpose", "beschreibung"],
};

function findColumn(headers: string[], candidates: string[]): number {
  const n = headers.map(norm);
  for (const c of candidates) {
    const i = n.indexOf(c);
    if (i >= 0) return i;
  }
  for (const c of candidates) {
    const i = n.findIndex((h) => h.includes(c));
    if (i >= 0) return i;
  }
  return -1;
}

export function parseCsv(text: string): ParsedTransaction[] {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  // Viele Banken stellen Metadaten vor die Kopfzeile; gesucht wird die erste Zeile mit Datum und Betrag
  const sep = (lines.slice(0, 20).join("\n").match(/;/g)?.length ?? 0) > (lines.slice(0, 20).join("\n").match(/,/g)?.length ?? 0) / 2 ? ";" : ",";
  const headerIndex = lines.findIndex((l) => {
    const h = splitCsvLine(l, sep);
    return findColumn(h, COLUMNS.date) >= 0 && findColumn(h, COLUMNS.amount) >= 0;
  });
  if (headerIndex < 0) throw new Error("Keine Kopfzeile mit Datum und Betrag gefunden.");
  const headers = splitCsvLine(lines[headerIndex], sep);
  const col = {
    date: findColumn(headers, COLUMNS.date),
    amount: findColumn(headers, COLUMNS.amount),
    name: findColumn(headers, COLUMNS.name),
    iban: findColumn(headers, COLUMNS.iban),
    purpose: findColumn(headers, COLUMNS.purpose),
  };
  const result: ParsedTransaction[] = [];
  for (const line of lines.slice(headerIndex + 1)) {
    const cells = splitCsvLine(line, sep);
    const date = parseGermanDate(cells[col.date] ?? "");
    if (!date || !cells[col.amount]) continue;
    result.push({
      valueDate: date,
      amount: parseAmount(cells[col.amount]),
      payeeName: col.name >= 0 ? cells[col.name] ?? "" : "",
      payeeIban: col.iban >= 0 ? (cells[col.iban] ?? "").replace(/\s/g, "") : "",
      purpose: col.purpose >= 0 ? cells[col.purpose] ?? "" : "",
    });
  }
  return result;
}

const asArray = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
type Node = Record<string, unknown>;
const text = (v: unknown): string => (v === undefined || v === null ? "" : typeof v === "object" ? String((v as Node)["#text"] ?? "") : String(v));

// ISO 20022 camt.053 (Kontoauszug), wie ihn deutsche Banken im Onlinebanking anbieten
export function parseCamt(xml: string): ParsedTransaction[] {
  const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true });
  const doc = parser.parse(xml) as Node;
  const root = (doc.Document as Node)?.BkToCstmrStmt as Node | undefined;
  if (!root) throw new Error("Keine camt.053-Datei.");
  const result: ParsedTransaction[] = [];
  for (const stmt of asArray(root.Stmt as Node | Node[])) {
    for (const ntry of asArray(stmt.Ntry as Node | Node[])) {
      const amt = Math.round(Number(text(ntry.Amt)) * 100);
      const credit = text(ntry.CdtDbtInd) === "CRDT";
      const date = parseGermanDate(text((ntry.ValDt as Node)?.Dt ?? (ntry.BookgDt as Node)?.Dt));
      const tx = asArray(((ntry.NtryDtls as Node)?.TxDtls as Node | Node[]) ?? [])[0] ?? {};
      const parties = (tx.RltdPties as Node) ?? {};
      const other = (credit ? parties.Dbtr : parties.Cdtr) as Node | undefined;
      const otherAcct = (credit ? parties.DbtrAcct : parties.CdtrAcct) as Node | undefined;
      const purpose = asArray(((tx.RmtInf as Node)?.Ustrd as unknown) ?? text(ntry.AddtlNtryInf)).map(text).join(" ");
      if (!date) continue;
      result.push({
        valueDate: date,
        amount: credit ? amt : -amt,
        payeeName: text(other?.Nm ?? (other?.Pty as Node)?.Nm),
        payeeIban: text((otherAcct?.Id as Node)?.IBAN),
        purpose,
      });
    }
  }
  return result;
}

export function parseBankFile(name: string, content: string): ParsedTransaction[] {
  if (name.toLowerCase().endsWith(".xml") || content.trimStart().startsWith("<?xml") || content.includes("BkToCstmrStmt")) return parseCamt(content);
  return parseCsv(content);
}

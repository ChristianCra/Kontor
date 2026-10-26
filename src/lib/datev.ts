import type { JournalEntry, Period } from "./journal";
import type { AssetAfa } from "./euer";

// DATEV-Format „Buchungsstapel“ (EXTF, Version 700) für den Import in DATEV Rechnungswesen

export type DatevSettings = { advisor: string; client: string; fiscalYearStart: Date; chart: "skr03" | "skr04"; bankAccounts: Map<number, string> };

export type DatevTransaction = { accountId: number; date: Date; amount: number; contactId: number | null; direction: "in" | "out"; docNumber: string; party: string };

// Debitoren 10000–69999, Kreditoren 70000–99999; Belege ohne Kontakt laufen über einen Sammelkreditor
export const debitor = (contactId: number) => String(10000 + contactId);
export const creditor = (contactId: number | null) => String(70000 + (contactId ?? 0));

// BU-Schlüssel für Vorsteuer bzw. Umsatzsteuer auf Konten ohne Automatikfunktion
function taxKey(e: JournalEntry): string {
  if (e.direction === "out") {
    if (e.taxType === "default") return e.taxRate === 19 ? "9" : e.taxRate === 7 ? "8" : "";
    if (e.taxType === "igerwerb") return e.taxRate === 19 ? "19" : "18";
    if (e.taxType === "rc13b") return "94";
  }
  return ""; // Erlöskonten 8400/8300 (SKR03) bzw. 4400/4300 (SKR04) sind Automatikkonten
}

const q = (s: string) => `"${s.replace(/"/g, '""').slice(0, 60)}"`;
const amount = (cents: number) => (Math.abs(cents) / 100).toFixed(2).replace(".", ",");
const ddmm = (d: Date) => `${String(d.getDate()).padStart(2, "0")}${String(d.getMonth() + 1).padStart(2, "0")}`;
const ymd = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;

export function validatePeriod(p: Period, fiscalYearStart: Date): string | null {
  if (p.to <= p.from) return "Das Ende liegt vor dem Beginn.";
  const yearLater = new Date(p.from);
  yearLater.setFullYear(yearLater.getFullYear() + 1);
  if (p.to > yearLater) return "Der Zeitraum darf höchstens ein Jahr umfassen.";
  const fyEnd = new Date(fiscalYearStart);
  fyEnd.setFullYear(fyEnd.getFullYear() + 1);
  if (p.from < fiscalYearStart || p.to > fyEnd) return "Der Zeitraum liegt außerhalb des Wirtschaftsjahres.";
  return null;
}

// Aufwandskonten der Abschreibung je Art (SKR03/SKR04)
function afaAccount(i: AssetAfa, chart: "skr03" | "skr04"): string | null {
  const intangible = i.account.number === (chart === "skr03" ? "0027" : "0135");
  const map: Record<AssetAfa["kind"], [string, string] | null> = {
    afa: intangible ? ["4822", "6200"] : ["4830", "6220"],
    gwg: ["4855", "6260"],
    pool: ["4862", "6264"],
    residual: ["2310", "6895"],
    proceeds: null,
  };
  const m = map[i.kind];
  return m ? m[chart === "skr03" ? 0 : 1] : null;
}

export function buildDatevCsv(entries: JournalEntry[], transactions: DatevTransaction[], p: Period, s: DatevSettings, enshrine: boolean, now = new Date(), afa: AssetAfa[] = []): { csv: string; lines: number } {
  const last = new Date(p.to.getTime() - 1);
  const header = [
    '"EXTF"', "700", "21", '"Buchungsstapel"', "13", `${ymd(now)}${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}000`,
    "", '"RE"', '"Kontor"', "", s.advisor, s.client, ymd(s.fiscalYearStart), "4", ymd(p.from), ymd(last),
    q(`Kontor ${ymd(p.from)}-${ymd(last)}`), "", "1", "0", enshrine ? "1" : "0", '"EUR"', "", "", "", "", `"${s.chart === "skr03" ? "03" : "04"}"`, "", "", "", "",
  ].join(";");
  const columns = ["Umsatz (ohne Soll/Haben-Kz)", "Soll/Haben-Kennzeichen", "WKZ Umsatz", "Kurs", "Basis-Umsatz", "WKZ Basis-Umsatz", "Konto", "Gegenkonto (ohne BU-Schlüssel)", "BU-Schlüssel", "Belegdatum", "Belegfeld 1", "Belegfeld 2", "Skonto", "Buchungstext"].join(";");
  const rows: string[] = [];
  const row = (cents: number, account: string, contra: string, key: string, date: Date, doc: string, text: string) =>
    rows.push([amount(cents), cents >= 0 ? '"S"' : '"H"', '"EUR"', "", "", "", account, contra, key ? `"${key}"` : "", ddmm(date), q(doc.slice(0, 36)), "", "", q(text)].join(";"));

  for (const e of entries) {
    if (e.date < p.from || e.date >= p.to || !e.gross) continue;
    const text = `${e.party} ${e.docNumber}`.trim();
    if (e.direction === "in") {
      // Forderung an Erlös: Soll Debitor, Haben Erlöskonto
      row(e.gross, e.contactId ? debitor(e.contactId) : "10000", e.account.number, taxKey(e), e.date, e.docNumber, text);
    } else {
      // Aufwand an Verbindlichkeit: Soll Aufwandskonto, Haben Kreditor
      row(e.gross, e.account.number, creditor(e.contactId), taxKey(e), e.date, e.docNumber, text);
    }
  }
  for (const t of transactions) {
    if (t.date < p.from || t.date >= p.to) continue;
    const bank = s.bankAccounts.get(t.accountId) ?? (s.chart === "skr03" ? "1200" : "1800");
    const party = t.direction === "in" ? (t.contactId ? debitor(t.contactId) : "10000") : creditor(t.contactId);
    // Zahlungseingang: Bank an Debitor; Zahlungsausgang: Kreditor an Bank
    if (t.direction === "in") row(t.amount, bank, party, "", t.date, t.docNumber, `Zahlung ${t.party}`);
    else row(t.amount, party, bank, "", t.date, t.docNumber, `Zahlung ${t.party}`);
  }
  // Abschreibungen: Soll AfA-Konto, Haben Anlagekonto. Monatswerte werden je Anlagegut und Konto zusammengefasst.
  const afaSums = new Map<string, { cents: number; account: string; contra: string; date: Date; text: string }>();
  for (const i of afa) {
    const account = afaAccount(i, s.chart);
    if (!account || i.date < p.from || i.date >= p.to) continue;
    const key = `${i.assetId}:${account}`;
    const cur = afaSums.get(key) ?? { cents: 0, account, contra: i.account.number, date: i.date, text: `${i.kind === "residual" ? "Abgang" : "AfA"} ${i.name}` };
    cur.cents += i.amount;
    if (i.date > cur.date) cur.date = i.date;
    afaSums.set(key, cur);
  }
  for (const [key, a] of afaSums) row(a.cents, a.account, a.contra, "", a.date, `AfA-${key.split(":")[0]}`, a.text);
  return { csv: [header, columns, ...rows].join("\r\n") + "\r\n", lines: rows.length };
}

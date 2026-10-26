import { amountsIn, type JournalEntry, type Period } from "./journal";

// Einnahmen-Überschuss-Rechnung nach dem Zuflussprinzip (§4 Abs. 3 EStG)

export type EuerLine = { key: string; label: string; amount: number; accounts: Map<string, { name: string; amount: number }>; note?: string };

export type EuerReport = {
  income: EuerLine[];
  expenses: EuerLine[];
  nonDeductible: EuerLine[];
  totalIncome: number;
  totalExpenses: number;
  profit: number;
  warnings: { source: JournalEntry["source"]; id: number; label: string; reason: string }[];
};

// Gruppierung der Aufwandskonten nach SKR03-Nummer
const EXPENSE_GROUPS: [string, string, (n: number) => boolean][] = [
  ["waren", "Waren, Rohstoffe und Hilfsstoffe", (n) => n >= 3200 && n < 3970 && !(n >= 3100 && n < 3200)],
  ["fremd", "Bezogene Fremdleistungen", (n) => n >= 3100 && n < 3200],
  ["raum", "Raumkosten und sonstige Grundstücksaufwendungen", (n) => n >= 4200 && n < 4300],
  ["vers", "Versicherungen und Beiträge", (n) => n >= 4360 && n < 4400],
  ["kfz", "Kfz-Kosten (ohne AfA)", (n) => n >= 4500 && n < 4600],
  ["werbung", "Werbekosten", (n) => n >= 4600 && n < 4650],
  ["bewirtung", "Bewirtungsaufwendungen (abziehbarer Teil, 70 %)", (n) => n === 4650],
  ["reise", "Reisekosten", (n) => n >= 4660 && n < 4700],
  ["tele", "Aufwendungen für Telekommunikation", (n) => n >= 4920 && n < 4930],
  ["fortbildung", "Fortbildungskosten", (n) => n === 4945],
  ["beratung", "Rechts- und Steuerberatung, Buchführung", (n) => n >= 4950 && n < 4960],
  ["gwg", "Aufwendungen für geringwertige Wirtschaftsgüter", (n) => n === 480],
  ["uebrige", "Übrige unbeschränkt abziehbare Betriebsausgaben", () => true],
];

// SKR04-Nummern werden über die gleichnamigen SKR03-Konten zugeordnet
export function computeEuer(entries: JournalEntry[], period: Period): EuerReport {
  const line = (key: string, label: string, note?: string): EuerLine => ({ key, label, amount: 0, accounts: new Map(), note });
  const income = new Map<string, EuerLine>([
    ["ss", line("ss", "Betriebseinnahmen als Kleinunternehmer")],
    ["pflichtig", line("pflichtig", "Umsatzsteuerpflichtige Betriebseinnahmen")],
    ["frei", line("frei", "Umsatzsteuerfreie, nicht steuerbare Betriebseinnahmen")],
    ["ust", line("ust", "Vereinnahmte Umsatzsteuer")],
    ["erstattung", line("erstattung", "Vom Finanzamt erstattete Umsatzsteuer")],
  ]);
  const expenses = new Map<string, EuerLine>(EXPENSE_GROUPS.map(([k, l]) => [k, line(k, l)]));
  expenses.set("vst", line("vst", "Gezahlte Vorsteuerbeträge"));
  expenses.set("ustfa", line("ustfa", "An das Finanzamt gezahlte Umsatzsteuer"));
  const nonDeductible = new Map<string, EuerLine>([["bewirtung", line("bewirtung", "Nicht abziehbarer Teil der Bewirtung (30 %)", "fließt nicht in die Summe ein")]]);
  const warnings: EuerReport["warnings"] = [];

  const book = (l: EuerLine, e: JournalEntry, amount: number) => {
    l.amount += amount;
    const acc = l.accounts.get(e.account.number) ?? { name: e.account.name, amount: 0 };
    acc.amount += amount;
    l.accounts.set(e.account.number, acc);
  };

  for (const e of entries) {
    const a = amountsIn(e, period, true);
    if (!a.gross) continue;
    if (e.account.kind === "PRIVATE") continue;
    if (e.account.kind === "TAX") {
      book(e.direction === "out" ? expenses.get("ustfa")! : income.get("erstattung")!, e, a.gross);
      continue;
    }
    if (e.direction === "in") {
      const key = e.taxType === "ss" ? "ss" : e.taxType === "default" && e.taxRate > 0 ? "pflichtig" : "frei";
      book(income.get(key)!, e, a.net);
      if (a.tax) book(income.get("ust")!, e, a.tax);
      continue;
    }
    if (e.account.kind === "ASSET" && e.skr03 !== "0480") {
      warnings.push({ source: e.source, id: e.docId, label: `Beleg ${e.docNumber || e.party}`, reason: "Abschreibungen auf Anlagegüter werden noch nicht berechnet" });
      continue;
    }
    // Ohne Vorsteuerabzug ist der Bruttobetrag Betriebsausgabe
    const expense = e.taxType === "novst" ? a.gross : a.net;
    const n = Number(e.skr03);
    const group = EXPENSE_GROUPS.find(([, , match]) => match(n))![0];
    if (group === "bewirtung") {
      const deductible = Math.round(expense * 0.7);
      book(expenses.get("bewirtung")!, e, deductible);
      book(nonDeductible.get("bewirtung")!, e, expense - deductible);
    } else book(expenses.get(group)!, e, expense);
    if (e.taxType === "default" && a.tax) book(expenses.get("vst")!, e, a.tax);
  }

  const inc = [...income.values()];
  const exp = [...expenses.values()];
  const totalIncome = inc.reduce((s, l) => s + l.amount, 0);
  const totalExpenses = exp.reduce((s, l) => s + l.amount, 0);
  return { income: inc, expenses: exp, nonDeductible: [...nonDeductible.values()], totalIncome, totalExpenses, profit: totalIncome - totalExpenses, warnings };
}

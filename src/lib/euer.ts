import { amountsIn, type JournalEntry, type Period } from "./journal";
import type { AfaItem } from "./afa";

// Einnahmen-Überschuss-Rechnung nach dem Zuflussprinzip (§4 Abs. 3 EStG),
// gegliedert nach den Zeilen und Kennzahlen der Anlage EÜR (Vordruck 2025)

export type EuerLine = {
  key: string;
  row: number | null; // Zeile der Anlage EÜR
  kz: string | null; // Kennzahl im ELSTER-Formular
  label: string;
  amount: number;
  accounts: Map<string, { name: string; amount: number }>;
  note?: string;
};

export type EuerReport = {
  income: EuerLine[];
  expenses: EuerLine[];
  nonDeductible: EuerLine[];
  totalIncome: number;
  totalExpenses: number;
  profit: number;
  formYear: number;
  warnings: { source: JournalEntry["source"] | "asset"; id: number; label: string; reason: string }[];
};

export const EUER_FORM_YEAR = 2025;

type LineDef = [key: string, row: number, kz: string, label: string];

const INCOME_LINES: LineDef[] = [
  ["ss", 12, "111", "Betriebseinnahmen als umsatzsteuerlicher Kleinunternehmer"],
  ["pflichtig", 15, "112", "Umsatzsteuerpflichtige Betriebseinnahmen"],
  ["frei", 16, "103", "Umsatzsteuerfreie, nicht umsatzsteuerbare Betriebseinnahmen"],
  ["ust", 17, "140", "Vereinnahmte Umsatzsteuer"],
  ["erstattung", 18, "141", "Vom Finanzamt erstattete und ggf. verrechnete Umsatzsteuer"],
];

const EXPENSE_LINES: LineDef[] = [
  ["waren", 27, "100", "Waren, Rohstoffe und Hilfsstoffe einschließlich Nebenkosten"],
  ["fremd", 29, "110", "Bezogene Fremdleistungen"],
  ["personal", 30, "120", "Ausgaben für eigenes Personal"],
  ["afa", 33, "130", "AfA auf bewegliche Wirtschaftsgüter"],
  ["gwg", 36, "132", "Aufwendungen für geringwertige Wirtschaftsgüter"],
  ["pool", 37, "137", "Auflösung Sammelposten nach §6 Abs. 2a EStG"],
  ["restbuchwert", 38, "135", "Restbuchwerte der im Kalenderjahr ausgeschiedenen Anlagegüter"],
  ["miete", 39, "150", "Miete/Pacht für Geschäftsräume und betrieblich genutzte Grundstücke"],
  ["grundstueck", 41, "151", "Sonstige Aufwendungen für betrieblich genutzte Grundstücke"],
  ["tele", 43, "280", "Aufwendungen für Telekommunikation"],
  ["reise", 44, "221", "Übernachtungs- und Reisenebenkosten bei Geschäftsreisen"],
  ["fortbildung", 45, "281", "Fortbildungskosten"],
  ["beratung", 46, "194", "Kosten für Rechts- und Steuerberatung, Buchführung"],
  ["mietebeweglich", 47, "222", "Miete/Leasing für bewegliche Wirtschaftsgüter (ohne Kfz)"],
  ["erhaltung", 48, "225", "Erhaltungsaufwendungen für Wirtschaftsgüter des Betriebsvermögens"],
  ["beitraege", 49, "223", "Beiträge, Gebühren, Abgaben und Versicherungen"],
  ["edv", 50, "228", "Laufende EDV-Kosten"],
  ["arbeitsmittel", 51, "229", "Arbeitsmittel"],
  ["transport", 53, "227", "Aufwendungen für Verpackung und Transport"],
  ["werbung", 54, "224", "Werbekosten"],
  ["zinsen", 56, "234", "Übrige Schuldzinsen"],
  ["vst", 57, "185", "Gezahlte Vorsteuerbeträge"],
  ["ustfa", 58, "186", "An das Finanzamt gezahlte und ggf. verrechnete Umsatzsteuer"],
  ["uebrige", 60, "183", "Übrige unbeschränkt abziehbare Betriebsausgaben"],
  ["geschenke", 62, "164", "Geschenke (abziehbar)"],
  ["bewirtung", 63, "165", "Bewirtungsaufwendungen (abziehbarer Teil, 70 %)"],
  ["kfzleasing", 68, "144", "Kfz: Leasingkosten"],
  ["kfzsteuer", 69, "145", "Kfz: Steuern, Versicherungen und Maut"],
  ["kfz", 70, "146", "Kfz: Sonstige tatsächliche Fahrtkosten ohne AfA und Zinsen"],
];

// Zuordnung der Aufwandskonten über die SKR03-Nummer (SKR04-Konten tragen die passende SKR03-Nummer mit)
function expenseLine(n: number): string {
  if (n >= 3100 && n < 3200) return "fremd";
  if (n >= 3200 && n < 4000) return "waren";
  if (n >= 4100 && n < 4200) return "personal";
  if (n >= 4210 && n < 4230) return "miete";
  if (n >= 4230 && n < 4300) return "grundstueck";
  if (n >= 4360 && n < 4400) return "beitraege";
  if (n === 4510 || n === 4520) return "kfzsteuer";
  if (n === 4570) return "kfzleasing";
  if (n >= 4500 && n < 4600) return "kfz";
  if (n >= 4630 && n < 4640) return "geschenke";
  if (n >= 4600 && n < 4650) return "werbung";
  if (n === 4650 || n === 4654) return "bewirtung";
  if (n >= 4660 && n < 4700) return "reise";
  if (n >= 4710 && n < 4760) return "transport";
  if (n >= 4800 && n < 4810) return "erhaltung";
  if (n >= 4810 && n < 4830) return "mietebeweglich";
  if (n >= 4920 && n < 4930) return "tele";
  if (n === 4930 || n === 4940) return "arbeitsmittel";
  if (n === 4945) return "fortbildung";
  if (n >= 4950 && n < 4960) return "beratung";
  if (n >= 4960 && n < 4970) return "edv";
  if (n >= 2100 && n < 2150) return "zinsen";
  return "uebrige";
}

export type AssetAfa = AfaItem & { name: string; account: { number: string; name: string } };

// Verkaufserlöse laufen über die Ausgangsrechnung und werden hier nicht doppelt erfasst
const AFA_LINE: Record<AfaItem["kind"], string | null> = { afa: "afa", gwg: "gwg", pool: "pool", residual: "restbuchwert", proceeds: null };

export function computeEuer(entries: JournalEntry[], period: Period, afa: AssetAfa[] = []): EuerReport {
  const line = ([key, row, kz, label]: LineDef, note?: string): EuerLine => ({ key, row, kz, label, amount: 0, accounts: new Map(), note });
  const income = new Map(INCOME_LINES.map((d) => [d[0], line(d)]));
  const expenses = new Map(EXPENSE_LINES.map((d) => [d[0], line(d)]));
  const nonDeductible = new Map([["bewirtung", line(["bewirtung", 63, "175", "Bewirtungsaufwendungen (nicht abziehbarer Teil, 30 %)"], "fließt nicht in die Summe ein")]]);
  const warnings: EuerReport["warnings"] = [];

  const book = (l: EuerLine, account: { number: string; name: string }, amount: number) => {
    l.amount += amount;
    const acc = l.accounts.get(account.number) ?? { name: account.name, amount: 0 };
    acc.amount += amount;
    l.accounts.set(account.number, acc);
  };

  for (const e of entries) {
    const a = amountsIn(e, period, true);
    if (!a.gross) continue;
    if (e.account.kind === "PRIVATE") continue;
    if (e.account.kind === "TAX") {
      book(e.direction === "out" ? expenses.get("ustfa")! : income.get("erstattung")!, e.account, a.gross);
      continue;
    }
    if (e.direction === "in") {
      const key = e.taxType === "ss" ? "ss" : e.taxType === "default" && e.taxRate > 0 ? "pflichtig" : "frei";
      book(income.get(key)!, e.account, a.net);
      if (a.tax) book(income.get("ust")!, e.account, a.tax);
      continue;
    }
    // Anschaffungskosten von Anlagegütern wirken nur über die AfA, die Vorsteuer daraus sofort
    if (e.account.kind !== "ASSET") {
      // Ohne Vorsteuerabzug ist der Bruttobetrag Betriebsausgabe
      const expense = e.taxType === "novst" ? a.gross : a.net;
      const key = expenseLine(Number(e.skr03));
      if (key === "bewirtung") {
        const deductible = Math.round(expense * 0.7);
        book(expenses.get("bewirtung")!, e.account, deductible);
        book(nonDeductible.get("bewirtung")!, e.account, expense - deductible);
      } else book(expenses.get(key)!, e.account, expense);
    }
    if (e.taxType === "default" && a.tax) book(expenses.get("vst")!, e.account, a.tax);
  }

  for (const i of afa) {
    if (i.date < period.from || i.date >= period.to) continue;
    const key = AFA_LINE[i.kind];
    if (key) book(expenses.get(key)!, i.account, i.amount);
  }

  const inc = [...income.values()];
  const exp = [...expenses.values()];
  const totalIncome = inc.reduce((s, l) => s + l.amount, 0);
  const totalExpenses = exp.reduce((s, l) => s + l.amount, 0);
  return { income: inc, expenses: exp, nonDeductible: [...nonDeductible.values()], totalIncome, totalExpenses, profit: totalIncome - totalExpenses, formYear: EUER_FORM_YEAR, warnings };
}

import { amountsIn, type JournalEntry, type Period } from "./journal";

// Zuordnung zu den Kennzahlen der Umsatzsteuer-Voranmeldung (Formular 2025)

export type UstvaField = {
  key: string;
  label: string;
  baseCode?: string; // Kennzahl der Bemessungsgrundlage
  taxCode?: string; // Kennzahl der Steuer
  base: number; // Cent
  tax: number; // Cent
  docs: { source: JournalEntry["source"]; id: number; label: string }[];
  group: "ust" | "vst";
};

const FIELDS: Omit<UstvaField, "base" | "tax" | "docs">[] = [
  { key: "81", label: "Steuerpflichtige Umsätze zum Steuersatz von 19 %", baseCode: "81", group: "ust" },
  { key: "86", label: "Steuerpflichtige Umsätze zum Steuersatz von 7 %", baseCode: "86", group: "ust" },
  { key: "41", label: "Innergemeinschaftliche Lieferungen an Abnehmer mit USt-IdNr.", baseCode: "41", group: "ust" },
  { key: "45", label: "Nicht steuerbare Umsätze (Leistungsort nicht im Inland)", baseCode: "45", group: "ust" },
  { key: "89", label: "Innergemeinschaftliche Erwerbe zum Steuersatz von 19 %", baseCode: "89", group: "ust" },
  { key: "93", label: "Innergemeinschaftliche Erwerbe zum Steuersatz von 7 %", baseCode: "93", group: "ust" },
  { key: "46", label: "Sonstige Leistungen eines im übrigen Gemeinschaftsgebiet ansässigen Unternehmers (§13b Abs. 1 UStG)", baseCode: "46", taxCode: "47", group: "ust" },
  { key: "66", label: "Vorsteuerbeträge aus Rechnungen von anderen Unternehmern", taxCode: "66", group: "vst" },
  { key: "61", label: "Vorsteuerbeträge aus dem innergemeinschaftlichen Erwerb", taxCode: "61", group: "vst" },
  { key: "67", label: "Vorsteuerbeträge aus Leistungen im Sinne des §13b UStG", taxCode: "67", group: "vst" },
];

export type UstvaReport = {
  fields: UstvaField[];
  ust: number;
  vst: number;
  payable: number; // Kennzahl 83, Cent
  unassigned: { source: JournalEntry["source"]; id: number; label: string; reason: string }[];
};

// Bemessungsgrundlagen werden in ELSTER in vollen Euro angegeben (Cent werden abgeschnitten)
export const fullEuros = (cents: number) => Math.trunc(cents / 100);

export function computeUstva(entries: JournalEntry[], period: Period, cash: boolean): UstvaReport {
  const fields = new Map(FIELDS.map((f) => [f.key, { ...f, base: 0, tax: 0, docs: [] as UstvaField["docs"] }]));
  const unassigned: UstvaReport["unassigned"] = [];
  const add = (key: string, base: number, tax: number, e: JournalEntry) => {
    const f = fields.get(key)!;
    f.base += base;
    f.tax += tax;
    if (!f.docs.some((d) => d.source === e.source && d.id === e.docId)) f.docs.push({ source: e.source, id: e.docId, label: `${e.docLabel} ${e.docNumber || e.party}` });
  };

  for (const e of entries) {
    // Bei Ist-Versteuerung zählen Ausgangsumsätze nach Zahlung; Vorsteuer immer nach Rechnungseingang (§16 UStG)
    const a = amountsIn(e, period, cash && e.direction === "in");
    if (!a.net && !a.tax) continue;
    if (["PRIVATE", "TAX"].includes(e.account.kind)) continue;
    if (e.direction === "in") {
      if (e.taxType === "ss") continue; // Kleinunternehmer: keine UStVA-Pflicht
      if (e.taxType === "eu") add("41", a.net, 0, e);
      else if (e.taxType === "noteu") add("45", a.net, 0, e);
      else if (e.taxRate === 19) add("81", a.net, a.tax, e);
      else if (e.taxRate === 7) add("86", a.net, a.tax, e);
      else if (e.taxRate !== 0) unassigned.push({ source: e.source, id: e.docId, label: `${e.docLabel} ${e.docNumber}`, reason: `Steuersatz ${e.taxRate} % wird nicht unterstützt` });
    } else {
      if (e.taxType === "default") add("66", 0, a.tax, e);
      else if (e.taxType === "igerwerb" || e.taxType === "rc13b") {
        // Steuer wird vom Empfänger geschuldet und zugleich als Vorsteuer abgezogen
        const tax = Math.round((a.net * e.taxRate) / 100);
        if (e.taxType === "igerwerb") {
          add(e.taxRate === 7 ? "93" : "89", a.net, tax, e);
          add("61", 0, tax, e);
        } else {
          add("46", a.net, tax, e);
          add("67", 0, tax, e);
        }
      }
    }
  }

  const list = [...fields.values()];
  // Für 81 und 86 rechnet ELSTER die Steuer selbst aus der Bemessungsgrundlage
  for (const f of list) if (f.key === "81" || f.key === "86") f.tax = Math.round((fullEuros(f.base) * 100 * (f.key === "81" ? 19 : 7)) / 100);
  const ust = list.filter((f) => f.group === "ust").reduce((s, f) => s + f.tax, 0);
  const vst = list.filter((f) => f.group === "vst").reduce((s, f) => s + f.tax, 0);
  return { fields: list.filter((f) => f.base || f.tax), ust, vst, payable: ust - vst, unassigned };
}

// Wert im ELSTER-Format: Komma als Dezimaltrenner, keine Tausenderpunkte
export function elsterValue(cents: number, wholeEuros = false): string {
  return wholeEuros ? String(fullEuros(cents)) : (cents / 100).toFixed(2).replace(".", ",");
}

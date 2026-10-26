import { describe, expect, it } from "vitest";
import { invoiceEntries, voucherEntries, type Period } from "./journal";
import { computeUstva } from "./ustva";
import { computeEuer } from "./euer";
import { buildDatevCsv, validatePeriod } from "./datev";
import { afaSchedule } from "./afa";

const q3: Period = { from: new Date(2026, 6, 1), to: new Date(2026, 9, 1) };
const contact = { name: "Kunde AG", firstName: null, lastName: null };

const invoice = (over: Partial<Parameters<typeof invoiceEntries>[0]> = {}) => ({
  id: 1, type: "RE", status: 1000, invoiceNumber: "RE-2026-0001", invoiceDate: new Date(2026, 6, 15), taxType: "default", discount: 0,
  contactId: 1, sumGross: 11900, enshrinedAt: null, contact,
  positions: [{ quantity: 1, priceNet: 10000, discount: 0, taxRate: 19 }],
  payments: [{ date: new Date(2026, 7, 1), amount: 11900, transactionId: null }],
  ...over,
});

const acct = (skr03: string, kind = "EXPENSE", name = "Konto") => ({ skr03, skr04: "9" + skr03, name, kind });

const voucher = (over: Partial<Parameters<typeof voucherEntries>[0]> = {}) => ({
  id: 2, status: 1000, creditDebit: "D", documentNumber: "4711", supplierName: "Telekom", supplierId: null, voucherDate: new Date(2026, 6, 20),
  taxType: "default", sumGross: 5950, enshrinedAt: null,
  positions: [{ taxRate: 19, sumNet: 5000, sumTax: 950, sumGross: 5950, accountingType: acct("4920") }],
  payments: [{ date: new Date(2026, 6, 25), amount: 5950, transactionId: null }],
  ...over,
});

describe("UStVA", () => {
  it("ermittelt Kennzahlen 81, 66 und die Zahllast", () => {
    const entries = [...invoiceEntries(invoice(), "skr03"), ...voucherEntries(voucher(), "skr03")];
    const r = computeUstva(entries, q3, false);
    expect(r.fields.find((f) => f.key === "81")).toMatchObject({ base: 10000, tax: 1900 });
    expect(r.fields.find((f) => f.key === "66")).toMatchObject({ tax: 950 });
    expect(r.payable).toBe(950);
  });

  it("zählt bei Ist-Versteuerung Umsätze erst mit Zahlung", () => {
    const unpaid = invoiceEntries(invoice({ payments: [] }), "skr03");
    expect(computeUstva(unpaid, q3, true).payable).toBe(0);
    expect(computeUstva(unpaid, q3, false).payable).toBe(1900);
  });

  it("bucht Reverse Charge als Steuer und Vorsteuer", () => {
    const rc = voucherEntries(voucher({ taxType: "rc13b", sumGross: 10000, positions: [{ taxRate: 19, sumNet: 10000, sumTax: 0, sumGross: 10000, accountingType: acct("4600") }] }), "skr03");
    const r = computeUstva(rc, q3, false);
    expect(r.fields.find((f) => f.key === "46")).toMatchObject({ base: 10000, tax: 1900 });
    expect(r.fields.find((f) => f.key === "67")).toMatchObject({ tax: 1900 });
    expect(r.payable).toBe(0);
  });

  it("mindert die Umsätze um Gutschriften", () => {
    const gu = invoiceEntries(invoice({ id: 3, type: "GU", payments: [] }), "skr03");
    const r = computeUstva([...invoiceEntries(invoice(), "skr03"), ...gu], q3, false);
    expect(r.fields.find((f) => f.key === "81")).toBeUndefined();
  });
});

describe("EÜR", () => {
  it("rechnet nach Zufluss und trennt Vorsteuer und Bewirtung", () => {
    const entries = [
      ...invoiceEntries(invoice(), "skr03"),
      ...voucherEntries(voucher(), "skr03"),
      ...voucherEntries(voucher({ id: 4, positions: [{ taxRate: 19, sumNet: 10000, sumTax: 1900, sumGross: 11900, accountingType: acct("4650") }], sumGross: 11900, payments: [{ date: new Date(2026, 6, 25), amount: 11900, transactionId: null }] }), "skr03"),
    ];
    const r = computeEuer(entries, q3);
    expect(r.income.find((l) => l.key === "pflichtig")!.amount).toBe(10000);
    expect(r.income.find((l) => l.key === "ust")!.amount).toBe(1900);
    expect(r.expenses.find((l) => l.key === "tele")!.amount).toBe(5000);
    expect(r.expenses.find((l) => l.key === "bewirtung")!.amount).toBe(7000);
    expect(r.nonDeductible[0].amount).toBe(3000);
    expect(r.expenses.find((l) => l.key === "vst")!.amount).toBe(2850);
    expect(r.profit).toBe(11900 - 5000 - 7000 - 2850);
  });

  it("bucht Anlagegüter über die AfA und die Vorsteuer sofort", () => {
    const laptop = voucher({ id: 5, sumGross: 238000, positions: [{ taxRate: 19, sumNet: 200000, sumTax: 38000, sumGross: 238000, accountingType: acct("0420", "ASSET", "BGA") }], payments: [{ date: new Date(2026, 6, 25), amount: 238000, transactionId: null }] });
    const asset = { id: 9, name: "Schreibtisch", method: "linear", acquisitionDate: new Date(2026, 6, 1), cost: 200000, usefulLifeYears: 10, disposalDate: null, disposalProceeds: 0 };
    const afa = afaSchedule(asset).map((i) => ({ ...i, name: asset.name, account: { number: "0420", name: "BGA" } }));
    const r = computeEuer(voucherEntries(laptop, "skr03"), q3, afa);
    expect(r.expenses.find((l) => l.key === "afa")).toMatchObject({ row: 33, kz: "130", amount: 5000 }); // 3 Monate à 16,67 €
    expect(r.expenses.find((l) => l.key === "vst")!.amount).toBe(38000);
    expect(r.totalExpenses).toBe(43000);
  });

  it("ignoriert unbezahlte Rechnungen", () => {
    const r = computeEuer(invoiceEntries(invoice({ payments: [] }), "skr03"), q3);
    expect(r.totalIncome).toBe(0);
  });
});

describe("DATEV", () => {
  it("prüft den Zeitraum gegen das Wirtschaftsjahr", () => {
    expect(validatePeriod(q3, new Date(2026, 0, 1))).toBeNull();
    expect(validatePeriod({ from: new Date(2025, 11, 1), to: new Date(2026, 1, 1) }, new Date(2026, 0, 1))).toMatch(/Wirtschaftsjahr/);
    expect(validatePeriod({ from: q3.to, to: q3.from }, new Date(2026, 0, 1))).toMatch(/Ende/);
  });

  it("erzeugt Kopf, Spalten und Buchungszeilen", () => {
    const entries = [...invoiceEntries(invoice(), "skr03"), ...voucherEntries(voucher(), "skr03")];
    const { csv, lines } = buildDatevCsv(entries, [], q3, { advisor: "1001", client: "1", fiscalYearStart: new Date(2026, 0, 1), chart: "skr03", bankAccounts: new Map() }, false, new Date(2026, 9, 1, 12, 0, 0));
    const rows = csv.trim().split("\r\n");
    expect(rows[0]).toMatch(/^"EXTF";700;21;"Buchungsstapel";13;20261001120000000;;"RE";"Kontor";;1001;1;20260101;4;20260701;20260930;/);
    expect(rows[1]).toMatch(/^Umsatz \(ohne Soll\/Haben-Kz\);Soll\/Haben-Kennzeichen/);
    expect(lines).toBe(2);
    expect(rows[2]).toBe('119,00;"S";"EUR";;;;10001;8400;;1507;"RE-2026-0001";;;"Kunde AG RE-2026-0001"');
    expect(rows[3]).toBe('59,50;"S";"EUR";;;;4920;70000;"9";2007;"4711";;;"Telekom 4711"');
  });

  it("exportiert die AfA je Anlagegut", () => {
    const asset = { id: 9, name: "Schreibtisch", method: "linear", acquisitionDate: new Date(2026, 6, 1), cost: 200000, usefulLifeYears: 10, disposalDate: null, disposalProceeds: 0 };
    const afa = afaSchedule(asset).map((i) => ({ ...i, name: asset.name, account: { number: "0420", name: "BGA" } }));
    const { csv, lines } = buildDatevCsv([], [], q3, { advisor: "1001", client: "1", fiscalYearStart: new Date(2026, 0, 1), chart: "skr03", bankAccounts: new Map() }, false, new Date(), afa);
    expect(lines).toBe(1);
    expect(csv.trim().split("\r\n")[2]).toBe('50,00;"S";"EUR";;;;4830;0420;;3009;"AfA-9";;;"AfA Schreibtisch"');
  });
});

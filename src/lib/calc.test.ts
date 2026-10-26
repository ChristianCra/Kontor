import { describe, expect, it } from "vitest";
import { computeTotals, paymentStatus } from "./calc";
import { parseCents } from "./money";

describe("computeTotals", () => {
  it("gruppiert Steuer nach Satz und rundet je Gruppe", () => {
    const t = computeTotals([
      { quantity: 3, priceNet: 333, discount: 0, taxRate: 19 },
      { quantity: 1, priceNet: 1000, discount: 0, taxRate: 7 },
      { quantity: 2, priceNet: 50, discount: 0, taxRate: 19 },
    ]);
    expect(t.positions).toEqual([999, 1000, 100]);
    expect(t.taxGroups).toEqual([
      { rate: 19, net: 1099, tax: 209 },
      { rate: 7, net: 1000, tax: 70 },
    ]);
    expect(t.gross).toBe(2099 + 279);
  });

  it("berücksichtigt Positions- und Gesamtrabatt", () => {
    const t = computeTotals([{ quantity: 10, priceNet: 10000, discount: 10, taxRate: 19 }], "default", 5);
    expect(t.net).toBe(85500);
    expect(t.tax).toBe(16245);
  });

  it("rechnet Kleinunternehmer ohne Umsatzsteuer", () => {
    const t = computeTotals([{ quantity: 1, priceNet: 10000, discount: 0, taxRate: 19 }], "ss");
    expect(t.tax).toBe(0);
    expect(t.gross).toBe(10000);
  });
});

describe("paymentStatus", () => {
  it("leitet Offen, Teilbezahlt und Bezahlt ab", () => {
    expect(paymentStatus(1000, 0)).toBe(200);
    expect(paymentStatus(1000, 400)).toBe(750);
    expect(paymentStatus(1000, 1000)).toBe(1000);
  });
});

describe("parseCents", () => {
  it("versteht deutsche und englische Schreibweise", () => {
    expect(parseCents("1.234,56")).toBe(123456);
    expect(parseCents("12,5")).toBe(1250);
    expect(parseCents("12.50")).toBe(1250);
    expect(parseCents("")).toBe(0);
  });
});
